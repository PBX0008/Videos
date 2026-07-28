# NCLEX Play

A premium YouTube-inspired NCLEX video learning library designed for desktop, laptop, tablet, and mobile screens.

## Interface highlights

- Familiar video-platform header with responsive search, profile, theme control, and collapsible navigation.
- Full desktop sidebar, mobile slide-out menu, and mobile bottom navigation.
- Horizontally scrollable subject filters, responsive video cards, playlist covers, folder collections, and progress bars.
- Polished watch page with HLS playback, previous/next controls, playlist queue, saved playback position, and automatic next-video playback.
- Search across subject names, folders, playlists, video titles, and slugs.
- Dark and light themes with saved preferences.
- PWA/service-worker support when served over HTTP.

## Repository structure

```text
Video-main/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── package.json
├── data/
│   ├── playlists_enriched.json
│   ├── library.normalized.json
│   └── library.js
├── src/
│   ├── app.js
│   └── styles.css
├── assets/
│   ├── favicon.svg
│   ├── logo.svg
│   └── fallback.svg
├── reports/
└── scripts/
```

## Run locally

### Python

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

### Vite

```bash
npm install
npm start
```

## Playback note

The repository does not store the video files. It plays the remote stream URLs already included in the library data. Internet access is therefore required for thumbnails and video playback.

## Current library

- 14 core categories
- 39 nested folders
- 356 playlists
- 1,519 playlist video entries
- 1,270 unique native video IDs
- 179h 40m total extracted runtime


## Device activation

The app now includes a browser/device activation gate. The accepted four-digit password is the current time in `Asia/Kolkata` (24-hour `HHMM`) after adding 3 hours and 13 minutes. A successful activation is saved in that browser's local storage for two calendar months. Clearing site data, using a private window, or opening another browser requires activation again.

This is a client-side convenience gate for a static site, not server-grade authentication. Anyone with access to the source code can inspect or alter the password logic. Strong access control requires a backend that validates codes and issues signed sessions.

## Playback, haptics and motivation reminders

- The video element is persistent. It docks into the watch page and becomes a floating mini-player when the viewer scrolls past it or opens another part of the library.
- Playback position is written to local storage during playback, on pause, during navigation, and when the PWA is backgrounded. Video cards and playlist rows show a red watched-progress line, and lessons resume from their saved timestamp.
- Supported Android browsers use the Vibration API for light press, selection, success, error, seeking, playback and throttled scroll feedback. Browsers that do not expose vibration, including current iOS Safari/PWA versions, retain the visual press animations but cannot provide physical vibration.
- Hourly Punjabi motivation requires the user to press **Enable notifications** and grant browser notification permission. While the PWA is open, a one-hour scheduler is used. The app also registers Periodic Background Sync where the browser supports it. Mobile operating systems and browsers control background execution, so exact delivery while the PWA is fully closed cannot be guaranteed without a push-notification server.
