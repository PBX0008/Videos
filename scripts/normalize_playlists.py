#!/usr/bin/env python3
"""Normalize playlists_enriched.json into browser-ready library files and reports."""
from __future__ import annotations
import csv, datetime, hashlib, json, re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data' / 'playlists_enriched.json'
BASE_IMG = 'https://members.simplenursing.com'


def slugify(value: object) -> str:
    text = str(value or '').strip().lower()
    text = re.sub(r'&', ' and ', text)
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return re.sub(r'-+', '-', text).strip('-') or 'untitled'


def thumb_url(value: object) -> str:
    url = str(value or '').strip()
    if not url:
        return ''
    if url.startswith('//'):
        return 'https:' + url
    if url.startswith('/'):
        return BASE_IMG + url
    return url


def seconds(value: object) -> int:
    try:
        return max(0, int(round(float(value or 0))))
    except Exception:
        return 0


def time_human(sec: int) -> str:
    sec = int(sec or 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f'{h}:{m:02d}:{s:02d}' if h else f'{m}:{s:02d}'


def duration_text(sec: int) -> str:
    sec = int(sec or 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    parts = []
    if h:
        parts.append(f'{h}h')
    if m:
        parts.append(f'{m}m')
    if s and not h:
        parts.append(f'{s}s')
    return ' '.join(parts) if parts else '0m'


def extract_videos(item: dict) -> list[dict]:
    out = []
    data = ((item.get('video_links') or {}).get('data') or {})
    for playlist in data.get('playlist') or []:
        for node in playlist.get('category_tree') or []:
            details = node.get('video_details')
            if details:
                out.append(details)
    return out


def extract_breadcrumbs(item: dict) -> list[dict]:
    return (((item.get('video_links') or {}).get('data') or {}).get('breadcrumbs') or [])


def main() -> None:
    raw = json.loads(SRC.read_text(encoding='utf-8'))
    categories, category_ids = [], []
    folders, playlists, videos = {}, {}, {}
    rows, all_video_ids = [], []

    for cat_index, cat in enumerate(raw):
        cat_title = cat.get('category') or f'Category {cat_index + 1}'
        cat_slug = slugify(cat_title)
        cat_id = 'cat-' + cat_slug
        category_ids.append(cat_id)
        folders[cat_id] = {
            'id': cat_id, 'kind': 'category', 'title': cat_title, 'slug': cat_slug,
            'thumbnail': '', 'path': [cat_title], 'pathSlugs': [cat_slug], 'parentId': None,
            'categoryId': cat_id, 'categoryTitle': cat_title, 'declaredVideos': cat.get('total_videos'),
            'childFolderIds': [], 'playlistIds': [], 'videoCount': 0, 'playlistCount': 0,
            'folderCount': 0, 'totalSeconds': 0,
        }
        categories.append({'id': cat_id, 'title': cat_title, 'slug': cat_slug, 'declaredVideos': cat.get('total_videos') or 0})

        def walk(items: list[dict], parent_id: str, path_titles: list[str], path_slugs: list[str]) -> None:
            for item_index, item in enumerate(items or []):
                title = item.get('title') or f'Untitled {item_index + 1}'
                slug = item.get('slug') or slugify(title)
                clean_slug = slugify(slug)
                has_children = bool(item.get('children'))
                item_type = item.get('type') or ('modal' if has_children else 'playlist')
                if has_children:
                    fid_seed = '/'.join(path_slugs + [clean_slug]) + f'/{item_index}'
                    fid = 'folder-' + hashlib.md5(fid_seed.encode()).hexdigest()[:12]
                    full_path = path_titles + [title]
                    folders[fid] = {
                        'id': fid, 'kind': item_type, 'title': title, 'slug': slug,
                        'thumbnail': thumb_url(item.get('thumbnail')), 'path': full_path,
                        'pathSlugs': path_slugs + [clean_slug], 'parentId': parent_id,
                        'categoryId': 'cat-' + path_slugs[0] if path_slugs else parent_id,
                        'categoryTitle': path_titles[0] if path_titles else title,
                        'declaredVideos': item.get('videos'), 'declaredDuration': item.get('duration'),
                        'childFolderIds': [], 'playlistIds': [], 'videoCount': 0, 'playlistCount': 0,
                        'folderCount': 0, 'totalSeconds': 0,
                    }
                    folders[parent_id]['childFolderIds'].append(fid)
                    walk(item.get('children'), fid, full_path, path_slugs + [clean_slug])
                    continue

                pid_seed = '/'.join(path_slugs + [clean_slug]) + f'/{item_index}'
                pid = 'playlist-' + hashlib.md5(pid_seed.encode()).hexdigest()[:12]
                full_path = path_titles + [title]
                extracted = extract_videos(item)
                total_sec = sum(seconds(v.get('video_duration')) for v in extracted)
                playlists[pid] = {
                    'id': pid, 'title': title, 'slug': slug, 'thumbnail': thumb_url(item.get('thumbnail')),
                    'type': item_type, 'path': full_path, 'pathText': ' / '.join(full_path),
                    'pathSlugs': path_slugs + [clean_slug], 'parentId': parent_id,
                    'categoryId': 'cat-' + path_slugs[0] if path_slugs else parent_id,
                    'categoryTitle': path_titles[0] if path_titles else '',
                    'declaredVideos': item.get('videos'), 'declaredDuration': item.get('duration'),
                    'videoCount': len(extracted), 'totalSeconds': total_sec,
                    'durationText': duration_text(total_sec),
                    'breadcrumbs': [{'slug': b.get('slug'), 'title': b.get('category_name'), 'url': b.get('url')} for b in extract_breadcrumbs(item)],
                    'videoIds': [],
                }
                folders[parent_id]['playlistIds'].append(pid)

                for vi, vd in enumerate(extracted):
                    native_id = str(vd.get('video_id') or vd.get('id') or vd.get('video_slug') or vi + 1)
                    vid = 'video-' + hashlib.md5(f'{pid}/{vi}/{native_id}'.encode()).hexdigest()[:14]
                    sec = seconds(vd.get('video_duration'))
                    thumb = thumb_url(vd.get('video_thumbnail')) or playlists[pid]['thumbnail']
                    record = {
                        'id': vid, 'position': vi + 1, 'title': vd.get('video_name') or title,
                        'slug': vd.get('video_slug') or slugify(vd.get('video_name') or title),
                        'streamUrl': str(vd.get('video_url') or '').strip(),
                        'durationSeconds': sec, 'duration': time_human(sec), 'durationText': duration_text(sec),
                        'thumbnail': thumb, 'native': {'id': vd.get('id'), 'video_id': vd.get('video_id'), 'video_category': vd.get('video_category'), 'tags': vd.get('video_tags'), 'excerpt': vd.get('sn_video_excerpt'), 'qb_category': vd.get('qb_category')},
                        'playlistId': pid, 'playlistTitle': title, 'categoryId': playlists[pid]['categoryId'],
                        'categoryTitle': playlists[pid]['categoryTitle'], 'folderId': parent_id,
                        'path': full_path, 'pathText': ' / '.join(full_path), 'source': 'uploaded playlists_enriched.json',
                    }
                    videos[vid] = record
                    playlists[pid]['videoIds'].append(vid)
                    all_video_ids.append(vid)
                    rows.append({
                        'category': record['categoryTitle'], 'folder_path': ' / '.join(full_path[:-1]),
                        'playlist': title, 'playlist_slug': slug, 'playlist_duration': playlists[pid]['durationText'],
                        'video_position': vi + 1, 'video_title': record['title'], 'video_slug': record['slug'],
                        'video_duration': record['duration'], 'video_duration_seconds': sec,
                        'thumbnail': record['thumbnail'], 'stream_url': record['streamUrl'],
                        'video_id': record['native']['video_id'], 'internal_id': record['native']['id'],
                        'category_tree': record['pathText'],
                    })

        walk(cat.get('items'), cat_id, [cat_title], [cat_slug])

    @lru_cache(None)
    def aggregate(fid: str) -> dict[str, int]:
        f = folders[fid]
        total_seconds = video_count = playlist_count = 0
        folder_count = len(f['childFolderIds'])
        for pid in f['playlistIds']:
            p = playlists[pid]
            total_seconds += p['totalSeconds']; video_count += p['videoCount']; playlist_count += 1
        for child in f['childFolderIds']:
            child_stats = aggregate(child)
            total_seconds += child_stats['seconds']; video_count += child_stats['videos']
            playlist_count += child_stats['playlists']; folder_count += child_stats['folders']
        f.update({'totalSeconds': total_seconds, 'videoCount': video_count, 'playlistCount': playlist_count, 'folderCount': folder_count, 'durationText': duration_text(total_seconds)})
        return {'seconds': total_seconds, 'videos': video_count, 'playlists': playlist_count, 'folders': folder_count}

    for cid in category_ids:
        aggregate(cid)
    for category in categories:
        f = folders[category['id']]
        category.update({'videoCount': f['videoCount'], 'playlistCount': f['playlistCount'], 'folderCount': f['folderCount'], 'durationText': f['durationText'], 'totalSeconds': f['totalSeconds']})

    summary = {
        'mainCategories': len(categories), 'foldersAndCategories': len(folders),
        'nestedFoldersOnly': len(folders) - len(categories), 'playlists': len(playlists),
        'playlistVideoEntries': len(videos),
        'uniqueNativeVideoIds': len(set(v['native'].get('video_id') for v in videos.values() if v['native'].get('video_id'))),
        'videosMissingThumbnail': sum(1 for v in videos.values() if not v.get('thumbnail')),
        'videosMissingStream': sum(1 for v in videos.values() if not v.get('streamUrl')),
        'totalSeconds': sum(v['durationSeconds'] for v in videos.values()),
        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    summary['totalDurationText'] = duration_text(summary['totalSeconds'])
    library = {'appName': 'Nclex video library', 'sourceFile': 'playlists_enriched.json', 'summary': summary, 'categoryIds': category_ids, 'categories': categories, 'folders': folders, 'playlists': playlists, 'videos': videos, 'allVideoIds': all_video_ids}

    (ROOT / 'data' / 'library.normalized.json').write_text(json.dumps(library, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'data' / 'library.js').write_text('window.NCLEX_LIBRARY = ' + json.dumps(library, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    with (ROOT / 'reports' / 'video_catalog.csv').open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader(); writer.writerows(rows)
    (ROOT / 'reports' / 'playlist_analysis.json').write_text(json.dumps({'summary': summary, 'categories': categories}, ensure_ascii=False, indent=2), encoding='utf-8')
    md = ['# Playlist Analysis Report\n\n', f"Source file: `playlists_enriched.json`\n\n", f"Generated: {summary['generatedAt']}\n\n", '## Totals\n\n']
    for key in ['mainCategories', 'nestedFoldersOnly', 'playlists', 'playlistVideoEntries', 'uniqueNativeVideoIds', 'videosMissingThumbnail', 'videosMissingStream', 'totalDurationText']:
        md.append(f'- **{key}**: {summary[key]}\n')
    md.append('\n## Main categories\n\n| Category | Folders | Playlists | Video entries | Duration | Original declared videos |\n|---|---:|---:|---:|---:|---:|\n')
    for c in categories:
        md.append(f"| {c['title']} | {c['folderCount']} | {c['playlistCount']} | {c['videoCount']} | {c['durationText']} | {c.get('declaredVideos', 0)} |\n")
    (ROOT / 'reports' / 'playlist_analysis.md').write_text(''.join(md), encoding='utf-8')
    print(f"Normalized {summary['playlistVideoEntries']} video entries into data/library.js")


if __name__ == '__main__':
    main()
