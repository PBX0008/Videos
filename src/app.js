(function () {
  'use strict';

  const ACCESS_STORAGE_KEY = 'nclex:device-access:v1';
  const DEVICE_STORAGE_KEY = 'nclex:device-id:v1';
  const ACCESS_OFFSET_MINUTES = 3 * 60 + 13;
  const ACCESS_TOLERANCE_MINUTES = 2;
  const HAPTICS_STORAGE_KEY = 'nclex:haptics:v1';
  const NOTIFICATION_STORAGE_KEY = 'nclex:notifications:v1';
  const NOTIFICATION_LAST_KEY = 'nclex:notification:last:v1';
  const NOTIFICATION_INDEX_KEY = 'nclex:notification:index:v1';

  function premiumHaptic(kind) {
    if (!('vibrate' in navigator)) return false;
    try {
      if (localStorage.getItem(HAPTICS_STORAGE_KEY) === 'off') return false;
    } catch (_error) { /* use default */ }
    const patterns = {
      feather: 3,
      scroll: 4,
      tap: 8,
      select: [8, 18, 5],
      success: [12, 24, 18],
      error: [24, 34, 24],
      close: [7, 16, 7]
    };
    try { return navigator.vibrate(patterns[kind] || patterns.tap); }
    catch (_error) { return false; }
  }

  function createDeviceId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (!id) {
        id = createDeviceId();
        localStorage.setItem(DEVICE_STORAGE_KEY, id);
      }
      return id;
    } catch (_error) {
      return null;
    }
  }

  function readAccessGrant() {
    try { return JSON.parse(localStorage.getItem(ACCESS_STORAGE_KEY) || 'null'); }
    catch (_error) { return null; }
  }

  function hasValidAccess() {
    const deviceId = getDeviceId();
    const grant = readAccessGrant();
    return Boolean(
      deviceId &&
      grant &&
      grant.deviceId === deviceId &&
      Number.isFinite(Number(grant.expiresAt)) &&
      Date.now() < Number(grant.expiresAt)
    );
  }

  function passwordForInstant(timestamp) {
    const adjusted = new Date(timestamp + ACCESS_OFFSET_MINUTES * 60 * 1000);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(adjusted);
    const hour = parts.find(part => part.type === 'hour');
    const minute = parts.find(part => part.type === 'minute');
    return `${hour ? hour.value : '00'}${minute ? minute.value : '00'}`;
  }

  function normalizeAccessPassword(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
  }

  function isCurrentAccessPassword(value) {
    const candidate = normalizeAccessPassword(value);
    if (candidate.length !== 4) return false;
    for (let delta = -ACCESS_TOLERANCE_MINUTES; delta <= ACCESS_TOLERANCE_MINUTES; delta += 1) {
      if (candidate === passwordForInstant(Date.now() + delta * 60 * 1000)) return true;
    }
    return false;
  }

  function calendarMonthsFromNow(months) {
    const expires = new Date();
    const originalDate = expires.getDate();
    expires.setDate(1);
    expires.setMonth(expires.getMonth() + months);
    const lastDay = new Date(expires.getFullYear(), expires.getMonth() + 1, 0).getDate();
    expires.setDate(Math.min(originalDate, lastDay));
    return expires.getTime();
  }

  function saveAccessGrant() {
    const deviceId = getDeviceId();
    if (!deviceId) return false;
    const grant = {
      deviceId,
      activatedAt: Date.now(),
      expiresAt: calendarMonthsFromNow(2),
      version: 1
    };
    try {
      localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(grant));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function initialiseAccessGate() {
    const gate = document.getElementById('accessGate');
    if (hasValidAccess()) {
      document.body.classList.remove('access-pending', 'access-locked');
      document.body.classList.add('access-granted');
      if (gate) gate.setAttribute('hidden', '');
      return true;
    }

    document.body.classList.remove('access-pending', 'access-granted');
    document.body.classList.add('access-locked');
    if (!gate) return false;

    const form = document.getElementById('accessForm');
    const input = document.getElementById('accessPassword');
    const message = document.getElementById('accessMessage');
    const submit = document.getElementById('accessSubmit');
    const reveal = document.getElementById('accessReveal');

    function showMessage(text, state) {
      message.textContent = text;
      message.dataset.state = state || '';
    }

    input.addEventListener('input', function () {
      const normalized = normalizeAccessPassword(input.value);
      if (input.value.replace(/\D/g, '') !== normalized || input.value.length > 4) input.value = normalized;
      input.removeAttribute('aria-invalid');
      showMessage('Use the four-digit password supplied for activation.', '');
    });

    reveal.addEventListener('click', function () {
      premiumHaptic('tap');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      reveal.textContent = showing ? 'Show' : 'Hide';
      reveal.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      input.focus();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!isCurrentAccessPassword(input.value)) {
        premiumHaptic('error');
        input.setAttribute('aria-invalid', 'true');
        showMessage('That password is not valid right now. Check the current code and try again.', 'error');
        gate.querySelector('.access-card').classList.remove('shake');
        requestAnimationFrame(() => gate.querySelector('.access-card').classList.add('shake'));
        input.select();
        return;
      }

      premiumHaptic('success');
      submit.disabled = true;
      submit.textContent = 'Activating…';
      if (!saveAccessGrant()) {
        submit.disabled = false;
        submit.textContent = 'Unlock device';
        showMessage('This browser is blocking local storage. Allow site storage and try again.', 'error');
        return;
      }

      showMessage('Device activated. Access is valid for two months.', 'success');
      gate.querySelector('.access-card').classList.add('unlocked');
      window.setTimeout(() => window.location.reload(), 550);
    });

    window.setTimeout(() => input.focus(), 80);
    return false;
  }

  if (!initialiseAccessGate()) return;

  const LIB = window.NCLEX_LIBRARY;
  const fallbackThumb = 'assets/fallback.svg';
  let hlsInstance = null;
  let activeVideoId = null;
  let playerState = null;
  let playerMountObserver = null;
  let notificationTimer = null;
  let progressWriteAt = 0;
  let lastScrollHapticAt = 0;
  let lastScrollHapticY = 0;

  const ICONS = {
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v1.5H4V6.5Zm0 5h16V13H4v-1.5Zm0 5h16V18H4v-1.5Z"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20.2 19.2-4.4-4.4a7 7 0 1 0-1 1l4.4 4.4 1-1ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5.3 5.6 5.6 5.6-5.6 1.1 1.1-5.6 5.6 5.6 5.6-1.1 1.1-5.6-5.6-5.6 5.6-1.1-1.1 5.6-5.6-5.6-5.6 1.1-1.1Z"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5-7 7 7 7 1.1-1.1L6 12.8h15v-1.6H6l5.1-5.1L10 5Z"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.1 2.5 10.5l1 1.2L5 10.5V21h5v-6h4v6h5V10.5l1.5 1.2 1-1.2L12 3.1Z"/></svg>',
    library: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h2v16H4V4Zm4 0h2v16H8V4Zm4.2 1 1.9-.6L19 19.1l-1.9.6L12.2 5Z"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5h7l2 2h9v11H3v-13Zm1.5 1.5v10h15V9h-8.1l-2-2H4.5Z"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 1-7.6 5.5L2 9.5 5.4 6l3.4 3.5H6A6.5 6.5 0 1 0 12 5.5V4Zm-.8 3.5h1.6v4.1l3 1.8-.8 1.3-3.8-2.3V7.5Z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg>',
    playlist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h11v1.5H4V5Zm0 4h11v1.5H4V9Zm0 4h7v1.5H4V13Zm12 0 5 3-5 3v-6Z"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm0 6.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm0 6.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5.9 6.1 6.1L9 18.1l1.1 1.1 7.2-7.2-7.2-7.2L9 5.9Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.2 1h1.6v3h-1.6V1Zm0 19h1.6v3h-1.6v-3ZM1 11.2h3v1.6H1v-1.6Zm19 0h3v1.6h-3v-1.6ZM4.2 3.1l2.1 2.1-1.1 1.1-2.1-2.1 1.1-1.1Zm13.5 13.5 2.1 2.1-1.1 1.1-2.1-2.1 1.1-1.1ZM18.7 3.1l1.1 1.1-2.1 2.1-1.1-1.1 2.1-2.1ZM5.2 16.6l1.1 1.1-2.1 2.1-1.1-1.1 2.1-2.1ZM12 6.2a5.8 5.8 0 1 1 0 11.6 5.8 5.8 0 0 1 0-11.6Zm0 1.6a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 3.1A9 9 0 1 0 21 15.8a7.5 7.5 0 0 1-6.3-12.7ZM12 4.5h.2A9 9 0 0 0 19.4 17 7.5 7.5 0 1 1 12 4.5Z"/></svg>',
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6V5Zm3 7 10-7v14L9 12Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2V5ZM5 5l10 7-10 7V5Z"/></svg>',
    collection: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H4V4Zm1.5 1.5v9h13v-9h-13ZM7 18h10v1.5H7V18Z"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19Zm0 1.5a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm-.8 4h1.6v1.7h-1.6V8Zm0 3.3h1.6V17h-1.6v-5.7Z"/></svg>',
    music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3v12.3a3.4 3.4 0 1 1-1.5-2.8V6.1l-8 2v9.3A3.4 3.4 0 1 1 8 14.6V6.8L19 3Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.4 2.4 0 0 0 2.3-2h-4.6A2.4 2.4 0 0 0 12 22Zm7-5.5-1.7-2.1V10a5.4 5.4 0 0 0-4.5-5.3V3a.8.8 0 0 0-1.6 0v1.7A5.4 5.4 0 0 0 6.7 10v4.4L5 16.5V18h14v-1.5ZM7.1 16.4l1.2-1.5V10a3.7 3.7 0 1 1 7.4 0v4.9l1.2 1.5H7.1Z"/></svg>',
    bellOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4.3 3.2 16.5 16.5-1.1 1.1-3-3H5v-1.5l1.7-2.1V10c0-1.1.3-2.2.9-3.1L3.2 4.3l1.1-1.1Zm4.4 4.7c-.3.6-.4 1.3-.4 2.1v4.7l1.2 1.5h5.6L8.7 9.8V7.9ZM12 2.2a.8.8 0 0 1 .8.8v1.7a5.4 5.4 0 0 1 4.5 5.3v4.2l-1.6-1.6V10a3.7 3.7 0 0 0-4.6-3.6L9.8 5.1c.5-.2.9-.3 1.4-.4V3a.8.8 0 0 1 .8-.8ZM9.7 20h4.6a2.4 2.4 0 0 1-4.6 0Z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v1.6H5.6V10H4V4Zm10 0h6v6h-1.6V5.6H14V4ZM4 14h1.6v4.4H10V20H4v-6Zm14.4 0H20v6h-6v-1.6h4.4V14Z"/></svg>'
  };

  if (!LIB) {
    document.getElementById('main').innerHTML = '<div class="empty">Library data could not be loaded. Check data/library.js.</div>';
    return;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const main = $('#main');
  const sidebar = $('#sidebar');
  const searchInput = $('#searchInput');
  const searchForm = $('#searchForm');
  const toast = $('#toast');
  const topbar = $('#topbar');
  const persistentPlayer = $('#persistentPlayer');
  const player = $('#player');
  const liveProgressFill = $('#liveProgressFill');
  const notificationPrompt = $('#notificationPrompt');
  const notificationButton = $('#notificationButton');

  const folders = LIB.folders || {};
  const playlists = LIB.playlists || {};
  const videos = LIB.videos || {};
  const categoryIds = LIB.categoryIds || [];

  function icon(name) {
    return ICONS[name] || '';
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeUrl(value) {
    const url = String(value || '').trim();
    if (!url) return fallbackThumb;
    if (/^(https?:)?\/\//i.test(url) || /^(assets|data)\//i.test(url)) return url;
    return fallbackThumb;
  }

  function compact(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat('en', { notation: number > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(number);
  }

  function routeHash(kind, id) {
    return id != null && id !== '' ? `#${kind}/${encodeURIComponent(id)}` : `#${kind}`;
  }

  function navigate(kind, id) {
    location.hash = routeHash(kind, id);
  }

  function parseRoute() {
    const raw = (location.hash || '#home').slice(1);
    const slash = raw.indexOf('/');
    if (slash === -1) return { kind: raw || 'home', id: '' };
    return { kind: raw.slice(0, slash) || 'home', id: decodeURIComponent(raw.slice(slash + 1)) };
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
  }


  function installContentProtection() {
    let lastNoticeAt = 0;
    const protectedShortcut = event => {
      const key = String(event.key || '').toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const shiftDeveloperShortcut = modifier && event.shiftKey && ['c', 'i', 'j', 'k'].includes(key);
      const regularProtectedShortcut = modifier && ['c', 'x', 's', 'p', 'u'].includes(key);
      const selectAllOutsideField = modifier && key === 'a' && !event.target.closest('input, textarea');
      return event.key === 'F12' || shiftDeveloperShortcut || regularProtectedShortcut || selectAllOutsideField;
    };

    const showProtectionNotice = () => {
      const now = Date.now();
      if (now - lastNoticeAt < 900) return;
      lastNoticeAt = now;
      premiumHaptic('error');
      showToast('Copying and downloading are disabled.');
    };

    const block = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      showProtectionNotice();
      return false;
    };

    ['copy', 'cut', 'contextmenu', 'dragstart'].forEach(type => {
      document.addEventListener(type, block, true);
    });

    document.addEventListener('selectstart', event => {
      if (event.target.closest('input, textarea')) return;
      block(event);
    }, true);

    document.addEventListener('keydown', event => {
      if (protectedShortcut(event)) block(event);
    }, true);

    document.addEventListener('keyup', event => {
      if (String(event.key || '').toLowerCase() === 'printscreen') {
        try { navigator.clipboard && navigator.clipboard.writeText(''); } catch (_error) { /* best effort */ }
        showProtectionNotice();
      }
    }, true);

    const hardenElement = element => {
      if (!(element instanceof Element)) return;
      if (element.matches('img, video, a')) element.setAttribute('draggable', 'false');
      if (element.matches('video')) {
        element.setAttribute('controlsList', 'nodownload noremoteplayback');
        element.setAttribute('disablePictureInPicture', '');
        try { element.disablePictureInPicture = true; } catch (_error) { /* unsupported */ }
      }
      element.querySelectorAll && element.querySelectorAll('img, video, a').forEach(hardenElement);
    };

    hardenElement(document.documentElement);
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => hardenElement(node)));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function hashNumber(text) {
    let hash = 0;
    for (const char of String(text || 'NCLEX')) hash = ((hash << 5) - hash) + char.charCodeAt(0);
    return Math.abs(hash);
  }

  function hueFor(text) {
    return hashNumber(text) % 360;
  }

  function initials(text) {
    return String(text || 'NCLEX')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'N';
  }

  function firstVideoOfPlaylist(playlistId) {
    const playlist = playlists[playlistId];
    return playlist && playlist.videoIds && playlist.videoIds.length ? videos[playlist.videoIds[0]] : null;
  }

  function imageForPlaylist(playlist) {
    const first = firstVideoOfPlaylist(playlist.id);
    return safeUrl(playlist.thumbnail || (first && first.thumbnail));
  }

  function getProgressMap() {
    try { return JSON.parse(localStorage.getItem('nclex:progress') || '{}'); } catch (_error) { return {}; }
  }

  function getProgress(id) {
    return Number(getProgressMap()[id] || 0);
  }

  function progressPercent(videoId, watchedOverride) {
    const video = videos[videoId];
    const duration = Number(video && video.durationSeconds || 0);
    const watched = Number(watchedOverride == null ? getProgress(videoId) : watchedOverride);
    if (watched < 1 || duration < 1) return 0;
    return Math.min(100, Math.max(0, (watched / duration) * 100));
  }

  function progressMarkup(video) {
    const percent = progressPercent(video.id);
    if (percent <= 0) return '';
    return `<span class="progress-track" data-progress-track="${esc(video.id)}"><span class="progress-fill" data-progress-for="${esc(video.id)}" style="width:${percent.toFixed(1)}%"></span></span>`;
  }

  function updateProgressVisuals(videoId, watched) {
    const percent = progressPercent(videoId, watched);
    document.querySelectorAll(`[data-progress-for="${CSS.escape(videoId)}"]`).forEach(fill => {
      fill.style.width = `${percent.toFixed(1)}%`;
    });
    if (playerState && playerState.videoId === videoId && liveProgressFill) {
      liveProgressFill.style.width = `${percent.toFixed(2)}%`;
    }
  }

  function getLastWatched() {
    try { return localStorage.getItem('nclex:lastWatched'); } catch (_error) { return null; }
  }

  function setLastWatched(id) {
    try { localStorage.setItem('nclex:lastWatched', id); } catch (_error) { /* ignored */ }
  }

  function saveProgress(id, time, force) {
    const value = Math.max(0, Number(time) || 0);
    const now = Date.now();
    if (!force && now - progressWriteAt < 1500) {
      updateProgressVisuals(id, value);
      return;
    }
    progressWriteAt = now;
    try {
      const data = getProgressMap();
      data[id] = Math.floor(value);
      localStorage.setItem('nclex:progress', JSON.stringify(data));
    } catch (_error) { /* ignored */ }
    updateProgressVisuals(id, value);
  }

  function destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
  }

  function disconnectPlayerMountObserver() {
    if (playerMountObserver) {
      playerMountObserver.disconnect();
      playerMountObserver = null;
    }
  }

  function updateMiniPlayerCopy() {
    if (!playerState) return;
    const title = $('#miniPlayerTitle');
    const subtitle = $('#miniPlayerSubtitle');
    if (title) title.textContent = playerState.title || 'Now playing';
    if (subtitle) subtitle.textContent = playerState.playlistTitle || playerState.categoryTitle || 'NCLEX Play';
  }

  function activateMiniPlayer() {
    if (!playerState || !persistentPlayer) return;
    if (persistentPlayer.parentElement !== document.body) document.body.appendChild(persistentPlayer);
    persistentPlayer.hidden = false;
    persistentPlayer.classList.remove('is-docked');
    persistentPlayer.classList.add('is-mini');
    document.body.classList.add('mini-player-visible');
    updateMiniPlayerCopy();
  }

  function dockPlayerInWatchPage() {
    const mount = $('#watchPlayerMount');
    if (!mount || !playerState || !persistentPlayer) return;
    persistentPlayer.hidden = false;
    persistentPlayer.classList.remove('is-mini');
    persistentPlayer.classList.add('is-docked');
    document.body.classList.remove('mini-player-visible');
    mount.appendChild(persistentPlayer);
    updateMiniPlayerCopy();
  }

  function observeWatchPlayerMount() {
    disconnectPlayerMountObserver();
    const mount = $('#watchPlayerMount');
    if (!mount || !('IntersectionObserver' in window)) return;
    playerMountObserver = new IntersectionObserver(entries => {
      const entry = entries[0];
      const route = parseRoute();
      if (!entry || !playerState || route.kind !== 'watch' || route.id !== playerState.videoId) return;
      if (entry.intersectionRatio < 0.2 && window.scrollY > 160) activateMiniPlayer();
      else dockPlayerInWatchPage();
    }, { threshold: [0, 0.2, 0.7] });
    playerMountObserver.observe(mount);
  }

  function closePersistentPlayer() {
    if (playerState && player.currentTime > 0) saveProgress(playerState.videoId, player.currentTime, true);
    premiumHaptic('close');
    disconnectPlayerMountObserver();
    player.pause();
    destroyHls();
    player.removeAttribute('src');
    player.removeAttribute('poster');
    try { player.load(); } catch (_error) { /* ignored */ }
    playerState = null;
    activeVideoId = null;
    persistentPlayer.hidden = true;
    persistentPlayer.classList.remove('is-mini', 'is-docked');
    document.body.classList.remove('mini-player-visible');
    if (liveProgressFill) liveProgressFill.style.width = '0%';
  }

  function preparePlayerForRender(route) {
    if (!playerState || !persistentPlayer) return;
    disconnectPlayerMountObserver();
    if (player.currentTime > 0) saveProgress(playerState.videoId, player.currentTime, true);
    if (persistentPlayer.parentElement !== document.body) document.body.appendChild(persistentPlayer);
    if (route.kind !== 'watch' || route.id !== playerState.videoId) activateMiniPlayer();
  }

  function pickMotivation() {
    const messages = Array.isArray(window.NCLEX_MOTIVATIONS) ? window.NCLEX_MOTIVATIONS : [];
    if (!messages.length) return '';
    let previous = -1;
    try { previous = Number(localStorage.getItem(NOTIFICATION_INDEX_KEY) || -1); } catch (_error) { /* ignored */ }
    let index = Math.floor(Math.random() * messages.length);
    if (messages.length > 1 && index === previous) index = (index + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length;
    try { localStorage.setItem(NOTIFICATION_INDEX_KEY, String(index)); } catch (_error) { /* ignored */ }
    return messages[index];
  }

  function notificationIsEnabled() {
    try { return localStorage.getItem(NOTIFICATION_STORAGE_KEY) === 'on' && window.Notification && Notification.permission === 'granted'; }
    catch (_error) { return false; }
  }

  function updateNotificationButton() {
    const enabled = notificationIsEnabled();
    notificationButton.innerHTML = enabled ? icon('bell') : icon('bellOff');
    notificationButton.classList.toggle('enabled', enabled);
    notificationButton.setAttribute('aria-label', enabled ? 'Turn off hourly motivation' : 'Enable hourly motivation');
    notificationButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }

  async function showMotivationNotification(force) {
    if (!notificationIsEnabled() || !('serviceWorker' in navigator)) return false;
    const now = Date.now();
    let last = 0;
    try { last = Number(localStorage.getItem(NOTIFICATION_LAST_KEY) || 0); } catch (_error) { /* ignored */ }
    if (!force && now - last < 55 * 60 * 1000) return false;
    const body = pickMotivation();
    if (!body) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('NCLEX Play · ਪੜ੍ਹਾਈ ਦਾ ਵੇਲਾ', {
        body,
        icon: './assets/icon-192.png',
        badge: './assets/badge-96.png',
        tag: 'nclex-hourly-motivation',
        renotify: true,
        requireInteraction: false,
        silent: false,
        data: { url: './index.html#home', motivation: true },
        vibrate: [70, 45, 35]
      });
      try { localStorage.setItem(NOTIFICATION_LAST_KEY, String(now)); } catch (_error) { /* ignored */ }
      return true;
    } catch (_error) {
      return false;
    }
  }

  function scheduleHourlyMotivation() {
    clearTimeout(notificationTimer);
    if (!notificationIsEnabled()) return;
    let last = 0;
    try { last = Number(localStorage.getItem(NOTIFICATION_LAST_KEY) || 0); } catch (_error) { /* ignored */ }
    const target = last > 0 ? last + 60 * 60 * 1000 : Date.now() + 60 * 60 * 1000;
    const delay = Math.max(1000, target - Date.now());
    notificationTimer = window.setTimeout(async () => {
      await showMotivationNotification(false);
      scheduleHourlyMotivation();
    }, delay);
  }

  async function registerPeriodicMotivation() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('periodicSync' in registration) {
        await registration.periodicSync.register('nclex-hourly-motivation', { minInterval: 60 * 60 * 1000 });
      }
    } catch (_error) { /* unsupported or browser-controlled */ }
  }

  async function enableNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      showToast('Notifications are not supported by this browser.');
      premiumHaptic('error');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      try { localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'off'); } catch (_error) { /* ignored */ }
      updateNotificationButton();
      notificationPrompt.hidden = true;
      showToast('Notification permission was not granted.');
      premiumHaptic('error');
      return;
    }
    try { localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'on'); } catch (_error) { /* ignored */ }
    notificationPrompt.hidden = true;
    updateNotificationButton();
    premiumHaptic('success');
    await registerPeriodicMotivation();
    await showMotivationNotification(true);
    scheduleHourlyMotivation();
    showToast('Hourly Punjabi motivation is on.');
  }

  function disableNotifications() {
    clearTimeout(notificationTimer);
    try { localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'off'); } catch (_error) { /* ignored */ }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if ('periodicSync' in registration) return registration.periodicSync.unregister('nclex-hourly-motivation');
        return undefined;
      }).catch(() => {});
    }
    updateNotificationButton();
    premiumHaptic('close');
    showToast('Hourly motivation is off.');
  }

  function maybeShowNotificationPrompt() {
    if (!('Notification' in window) || Notification.permission === 'denied' || notificationIsEnabled()) return;
    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem('nclex:notification:dismissed:v1') || 0); } catch (_error) { /* ignored */ }
    if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    window.setTimeout(() => { notificationPrompt.hidden = false; }, 900);
  }

  function categoryRail(activeCategoryId) {
    return `
      <nav class="category-rail" aria-label="Subjects">
        <a class="chip ${!activeCategoryId ? 'active' : ''}" href="#home">All</a>
        ${categoryIds.map(id => {
          const category = folders[id];
          if (!category) return '';
          return `<a class="chip ${id === activeCategoryId ? 'active' : ''}" href="${esc(routeHash('folder', id))}">${esc(category.title)} <span class="chip-count">${compact(category.videoCount)}</span></a>`;
        }).join('')}
      </nav>`;
  }

  function breadcrumb(path, currentKind) {
    if (!path || !path.length) return '';
    const items = [{ title: 'Home', href: '#home' }];
    const matchingFolders = Object.values(folders)
      .filter(folder => folder.path && path.join('|').startsWith(folder.path.join('|')))
      .sort((a, b) => a.path.length - b.path.length);
    const seen = new Set();
    matchingFolders.forEach(folder => {
      const href = routeHash('folder', folder.id);
      if (!seen.has(href)) {
        seen.add(href);
        items.push({ title: folder.title, href });
      }
    });
    if (currentKind !== 'folder') items.push({ title: path[path.length - 1], href: '' });
    return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map((item, index) => {
      const last = index === items.length - 1;
      return `${item.href && !last ? `<a href="${esc(item.href)}">${esc(item.title)}</a>` : `<span>${esc(item.title)}</span>`}${last ? '' : '<span>›</span>'}`;
    }).join('')}</nav>`;
  }

  function renderTreeNode(folderId, activeFolderId, depth = 0) {
    const folder = folders[folderId];
    if (!folder) return '';
    const children = depth < 2 ? (folder.childFolderIds || []).map(id => renderTreeNode(id, activeFolderId, depth + 1)).join('') : '';
    return `
      <div class="tree-node">
        <a class="tree-link ${folderId === activeFolderId ? 'active' : ''}" href="${esc(routeHash('folder', folderId))}">
          <span class="tree-icon">${icon('folder')}</span>
          <span class="tree-label">${esc(folder.title)}</span>
          <span class="tree-count">${compact(folder.videoCount)}</span>
        </a>
        ${children ? `<div class="tree-children">${children}</div>` : ''}
      </div>`;
  }

  function renderSidebar(route, activeFolderId) {
    const summary = LIB.summary || {};
    const last = getLastWatched();
    const activeHome = route.kind === 'home';
    const activeLibrary = route.kind === 'library';
    sidebar.innerHTML = `
      <section class="sidebar-section">
        <a class="nav-link ${activeHome ? 'active' : ''}" data-mini-label="Home" href="#home">
          <span class="nav-icon">${icon('home')}</span><span class="nav-label">Home</span>
        </a>
        <a class="nav-link ${activeLibrary ? 'active' : ''}" data-mini-label="Library" href="#library">
          <span class="nav-icon">${icon('library')}</span><span class="nav-label">Library</span>
        </a>
        ${last && videos[last] ? `<a class="nav-link" data-mini-label="Resume" href="${esc(routeHash('watch', last))}">
          <span class="nav-icon">${icon('history')}</span><span class="nav-label">Continue watching</span>
        </a>` : ''}
      </section>
      <section class="sidebar-section subjects">
        <h2 class="sidebar-heading">Explore subjects</h2>
        <div class="tree">${categoryIds.map(id => renderTreeNode(id, activeFolderId)).join('')}</div>
      </section>
      <section class="sidebar-section subjects">
        <h2 class="sidebar-heading">NCLEX Play</h2>
        <p class="sidebar-summary">${compact(summary.playlistVideoEntries)} lessons · ${compact(summary.playlists)} playlists · ${esc(summary.totalDurationText || '')}</p>
      </section>`;
  }

  function statGrid() {
    const summary = LIB.summary || {};
    return `
      <section class="stat-grid" aria-label="Library statistics">
        <div class="stat-card"><strong>${compact(summary.mainCategories)}</strong><span>Core subjects</span></div>
        <div class="stat-card"><strong>${compact(summary.playlists)}</strong><span>Curated playlists</span></div>
        <div class="stat-card"><strong>${compact(summary.playlistVideoEntries)}</strong><span>Video lessons</span></div>
        <div class="stat-card"><strong>${esc(summary.totalDurationText || '')}</strong><span>Total learning time</span></div>
      </section>`;
  }

  function videoCard(videoId) {
    const video = videos[videoId];
    if (!video) return '';
    const hue = hueFor(video.playlistTitle || video.categoryTitle);
    return `
      <article class="video-card">
        <a href="${esc(routeHash('watch', videoId))}" aria-label="Play ${esc(video.title)}">
          <div class="thumb">
            <img loading="lazy" src="${esc(safeUrl(video.thumbnail))}" alt="${esc(video.title)}" onerror="this.onerror=null;this.src='${fallbackThumb}'">
            <span class="thumb-overlay"><span class="play-circle">${icon('play')}</span></span>
            <span class="duration-pill">${esc(video.duration)}</span>
            ${progressMarkup(video)}
          </div>
          <div class="card-info">
            <span class="card-avatar" style="--avatar-hue:${hue}">${esc(initials(video.categoryTitle))}</span>
            <span class="card-copy">
              <h3 class="card-title">${esc(video.title)}</h3>
              <span class="card-meta">${esc(video.playlistTitle)}<br>${esc(video.categoryTitle)} · ${esc(video.durationText)}</span>
            </span>
            <span class="card-menu icon-button" aria-hidden="true">${icon('more')}</span>
          </div>
        </a>
      </article>`;
  }

  function playlistCard(playlistId) {
    const playlist = playlists[playlistId];
    if (!playlist) return '';
    const hue = hueFor(playlist.title);
    return `
      <article class="playlist-card">
        <a href="${esc(routeHash('playlist', playlistId))}" aria-label="Open playlist ${esc(playlist.title)}">
          <div class="thumb">
            <img loading="lazy" src="${esc(imageForPlaylist(playlist))}" alt="${esc(playlist.title)}" onerror="this.onerror=null;this.src='${fallbackThumb}'">
            <span class="playlist-stack"><span>${icon('playlist')}<br>${compact(playlist.videoCount)} videos</span></span>
            <span class="playlist-pill">${icon('playlist')} Playlist</span>
          </div>
          <div class="card-info">
            <span class="card-avatar" style="--avatar-hue:${hue}">${esc(initials(playlist.categoryTitle || playlist.title))}</span>
            <span class="card-copy">
              <h3 class="card-title">${esc(playlist.title)}</h3>
              <span class="card-meta">${esc(playlist.categoryTitle || '')} · ${esc(playlist.durationText || playlist.declaredDuration || '')}<br>View full playlist</span>
            </span>
            <span class="card-menu icon-button" aria-hidden="true">${icon('more')}</span>
          </div>
        </a>
      </article>`;
  }

  function folderCard(folderId) {
    const folder = folders[folderId];
    if (!folder) return '';
    const hue = hueFor(folder.title);
    return `
      <a class="folder-card" href="${esc(routeHash('folder', folderId))}">
        <span class="folder-icon" style="--folder-hue:${hue}">${icon('folder')}</span>
        <span>
          <h3>${esc(folder.title)}</h3>
          <span class="card-meta">${compact(folder.videoCount)} videos · ${compact(folder.playlistCount)} playlists</span>
        </span>
        <span class="chevron">${icon('chevron')}</span>
      </a>`;
  }

  function videoRow(videoId, options = {}) {
    const video = videos[videoId];
    if (!video) return '';
    return `
      <a class="video-row ${options.active ? 'active' : ''}" href="${esc(routeHash('watch', videoId))}">
        <span class="row-num">${options.active ? `<span class="playing">${icon('music')}</span>` : esc(video.position)}</span>
        <span class="row-thumb">
          <img loading="lazy" src="${esc(safeUrl(video.thumbnail))}" alt="${esc(video.title)}" onerror="this.onerror=null;this.src='${fallbackThumb}'">
          <span class="duration-pill">${esc(video.duration)}</span>
          ${progressMarkup(video)}
        </span>
        <span class="row-copy">
          <span class="row-title">${esc(video.title)}</span>
          <span class="card-meta">${esc(video.playlistTitle)} · ${esc(video.categoryTitle)}</span>
        </span>
        <span class="row-menu icon-button" aria-hidden="true">${icon('more')}</span>
      </a>`;
  }

  function emptyState(title, message) {
    return `<div class="empty"><div>${icon('collection')}<strong style="display:block;color:var(--text);margin-bottom:6px">${esc(title)}</strong><span>${esc(message)}</span></div></div>`;
  }

  function renderHome() {
    activeVideoId = null;
    const allVideos = Object.values(videos);
    const allPlaylists = Object.values(playlists);
    const lastId = getLastWatched();
    const lastVideo = lastId && videos[lastId];
    const recommended = allVideos.slice(0, 24).map(video => video.id);
    const featured = allPlaylists.slice(0, 12).map(playlist => playlist.id);

    main.innerHTML = `
      ${categoryRail(null)}
      <section class="hero-banner">
        <div>
          <p class="page-kicker">Built for focused NCLEX preparation</p>
          <h1>Your complete nursing video library.</h1>
          <p>Move through subjects, playlists and lessons with a fast, familiar viewing experience designed for laptop and mobile study.</p>
          <div class="hero-actions">
            <a class="button primary" href="${esc(routeHash('folder', categoryIds[0] || ''))}">${icon('play')} Start learning</a>
            <a class="button" href="#library">${icon('library')} Browse library</a>
          </div>
        </div>
        <div class="hero-mark" aria-hidden="true"><img src="assets/logo.svg" alt=""></div>
      </section>
      ${statGrid()}
      ${lastVideo ? `<section class="section">
        <div class="section-head"><div><h2>Continue watching</h2><p>Resume exactly where you stopped.</p></div></div>
        <div class="video-grid">${videoCard(lastVideo.id)}</div>
      </section>` : ''}
      <section class="section">
        <div class="section-head"><div><h2>Recommended lessons</h2><p>Start with these lessons from across your library.</p></div></div>
        <div class="video-grid">${recommended.map(videoCard).join('')}</div>
      </section>
      <section class="section">
        <div class="section-head"><div><h2>Featured playlists</h2><p>Structured learning paths for deeper study.</p></div><a class="button" href="#library">View all</a></div>
        <div class="playlist-grid">${featured.map(playlistCard).join('')}</div>
      </section>`;
  }

  function renderLibrary() {
    activeVideoId = null;
    const featured = Object.values(playlists).slice(0, 24).map(playlist => playlist.id);
    main.innerHTML = `
      ${categoryRail(null)}
      <header class="page-header">
        <div><p class="page-kicker">Everything in one place</p><h1>Your library</h1><p>Browse all subjects, folders and curated NCLEX playlists.</p></div>
      </header>
      <section class="section">
        <div class="section-head"><div><h2>Subjects</h2><p>Choose a subject to reveal its folders and playlists.</p></div></div>
        <div class="folder-grid">${categoryIds.map(folderCard).join('')}</div>
      </section>
      <section class="section">
        <div class="section-head"><div><h2>All playlists</h2><p>A selection from your complete playlist catalogue.</p></div></div>
        <div class="playlist-grid">${featured.map(playlistCard).join('')}</div>
      </section>`;
  }

  function renderFolder(folderId) {
    const folder = folders[folderId] || folders[categoryIds[0]];
    if (!folder) return renderHome();
    activeVideoId = null;
    const childFolders = folder.childFolderIds || [];
    const playlistIds = folder.playlistIds || [];
    const categoryId = folder.categoryId || (folder.kind === 'category' ? folder.id : null);
    main.innerHTML = `
      ${categoryRail(categoryId)}
      ${breadcrumb(folder.path, 'folder')}
      <header class="page-header">
        <div>
          <p class="page-kicker">Subject collection</p>
          <h1>${esc(folder.title)}</h1>
          <p>${compact(folder.videoCount)} video lessons · ${compact(folder.playlistCount)} playlists · ${esc(folder.durationText || '')}</p>
        </div>
        ${playlistIds.length ? `<a class="button primary" href="${esc(routeHash('playlist', playlistIds[0]))}">${icon('play')} Play first playlist</a>` : ''}
      </header>
      <section class="stat-grid">
        <div class="stat-card"><strong>${compact(folder.folderCount)}</strong><span>Subfolders</span></div>
        <div class="stat-card"><strong>${compact(folder.playlistCount)}</strong><span>Playlists</span></div>
        <div class="stat-card"><strong>${compact(folder.videoCount)}</strong><span>Video lessons</span></div>
        <div class="stat-card"><strong>${esc(folder.durationText || '—')}</strong><span>Total duration</span></div>
      </section>
      ${childFolders.length ? `<section class="section"><div class="section-head"><div><h2>Explore folders</h2><p>Continue into a focused topic area.</p></div></div><div class="folder-grid">${childFolders.map(folderCard).join('')}</div></section>` : ''}
      <section class="section">
        <div class="section-head"><div><h2>${playlistIds.length ? 'Playlists' : 'No direct playlists'}</h2><p>${playlistIds.length ? 'Choose a playlist to see every lesson.' : 'Open one of the subfolders above.'}</p></div></div>
        ${playlistIds.length ? `<div class="playlist-grid">${playlistIds.map(playlistCard).join('')}</div>` : emptyState('Nothing here yet', 'This folder contains subfolders rather than direct playlists.')}
      </section>`;
  }

  function renderPlaylist(playlistId) {
    const playlist = playlists[playlistId];
    if (!playlist) return renderHome();
    activeVideoId = null;
    const firstVideoId = playlist.videoIds && playlist.videoIds[0];
    const hue = hueFor(playlist.title);
    main.innerHTML = `
      ${categoryRail(playlist.categoryId)}
      ${breadcrumb(playlist.path, 'playlist')}
      <section class="playlist-hero" style="--hero-color:hsl(${hue} 82% 48%)">
        <div class="playlist-cover">
          <div class="thumb">
            <img src="${esc(imageForPlaylist(playlist))}" alt="${esc(playlist.title)}" onerror="this.onerror=null;this.src='${fallbackThumb}'">
            <span class="playlist-pill">${icon('playlist')} Playlist</span>
          </div>
        </div>
        <div class="playlist-copy">
          <span class="playlist-label">Playlist</span>
          <h1>${esc(playlist.title)}</h1>
          <div class="playlist-facts">${esc(playlist.categoryTitle || '')}<br>${compact(playlist.videoCount)} videos · ${esc(playlist.durationText || playlist.declaredDuration || '')}</div>
          <div class="hero-actions">
            ${firstVideoId ? `<a class="button primary" href="${esc(routeHash('watch', firstVideoId))}">${icon('play')} Play all</a>` : ''}
            <a class="button" href="${esc(routeHash('folder', playlist.parentId || playlist.categoryId))}">${icon('folder')} Open folder</a>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><div><h2>Videos</h2><p>${compact(playlist.videoCount)} lessons in this playlist.</p></div></div>
        <div class="video-list">${(playlist.videoIds || []).map(id => videoRow(id)).join('')}</div>
      </section>`;
  }

  function renderWatch(videoId) {
    const video = videos[videoId];
    if (!video) return renderHome();
    activeVideoId = videoId;
    const playlist = playlists[video.playlistId];
    const queueIds = playlist ? playlist.videoIds || [] : [];
    const currentIndex = queueIds.indexOf(videoId);
    const previousId = currentIndex > 0 ? queueIds[currentIndex - 1] : '';
    const nextId = currentIndex >= 0 && currentIndex < queueIds.length - 1 ? queueIds[currentIndex + 1] : '';
    const hue = hueFor(video.categoryTitle);
    setLastWatched(videoId);

    main.innerHTML = `
      <section class="watch-page">
        <div class="watch-layout">
          <div class="watch-main">
            <div class="watch-player-mount" id="watchPlayerMount" aria-label="Video player"></div>
            <h1 class="watch-title">${esc(video.title)}</h1>
            <div class="watch-toolbar">
              <div class="channel-line">
                <span class="channel-avatar" style="--avatar-hue:${hue}">${esc(initials(video.categoryTitle))}</span>
                <span class="channel-copy"><span class="channel-name">${esc(video.playlistTitle)}</span><span class="channel-sub">${esc(video.categoryTitle)} · ${esc(video.durationText)}</span></span>
              </div>
              <div class="watch-actions">
                ${previousId ? `<a class="button" href="${esc(routeHash('watch', previousId))}">${icon('previous')} Previous</a>` : ''}
                ${nextId ? `<a class="button" href="${esc(routeHash('watch', nextId))}">Next ${icon('next')}</a>` : ''}
                <a class="button" href="${esc(routeHash('playlist', video.playlistId))}">${icon('playlist')} Playlist</a>
              </div>
            </div>
            <div class="description-box">
              <strong>${esc(video.pathText)}</strong>
              <div class="meta">Lesson ${esc(video.position)} of ${compact(queueIds.length)} · ${esc(video.duration)}<br>Continue through the playlist using the queue or the previous and next controls.</div>
            </div>
          </div>
          <aside class="queue" aria-label="Playlist queue">
            <div class="queue-head"><h2>${esc(playlist ? playlist.title : 'Up next')}</h2><div class="card-meta">${currentIndex + 1} / ${compact(queueIds.length)} · ${esc(playlist ? playlist.durationText : '')}</div></div>
            <div class="video-list">${queueIds.map(id => videoRow(id, { active: id === videoId })).join('')}</div>
          </aside>
        </div>
      </section>`;

    setupPlayer(video.streamUrl, videoId, nextId);
  }

  function renderSearch(query) {
    const clean = String(query || '').trim();
    const lower = clean.toLowerCase();
    activeVideoId = null;
    searchInput.value = clean;
    updateSearchState();
    if (!clean) {
      main.innerHTML = `
        ${categoryRail(null)}
        <header class="page-header"><div><p class="page-kicker">Find your next lesson</p><h1>Search NCLEX Play</h1><p>Search by subject, playlist, folder or video title.</p></div></header>
        ${emptyState('Start typing to search', 'Use the search box above to explore the full video library.')}`;
      return;
    }

    const words = lower.split(/\s+/).filter(Boolean);
    const score = text => {
      const haystack = String(text || '').toLowerCase();
      return words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
    };

    const videoMatches = Object.values(videos)
      .map(video => ({ id: video.id, score: score(`${video.title} ${video.playlistTitle} ${video.categoryTitle} ${video.pathText} ${video.slug}`) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map(item => item.id);

    const playlistMatches = Object.values(playlists)
      .map(playlist => ({ id: playlist.id, score: score(`${playlist.title} ${playlist.categoryTitle} ${playlist.pathText} ${playlist.slug}`) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map(item => item.id);

    main.innerHTML = `
      ${categoryRail(null)}
      <h1 class="search-summary">Results for <span>“${esc(clean)}”</span></h1>
      ${playlistMatches.length ? `<section class="section"><div class="section-head"><div><h2>Playlists</h2><p>${playlistMatches.length} matching playlists.</p></div></div><div class="playlist-grid">${playlistMatches.map(playlistCard).join('')}</div></section>` : ''}
      <section class="section">
        <div class="section-head"><div><h2>Videos</h2><p>${videoMatches.length} matching lessons.</p></div></div>
        ${videoMatches.length ? `<div class="video-grid">${videoMatches.map(videoCard).join('')}</div>` : emptyState('No videos found', 'Try a shorter or more general search term.')}
      </section>`;
  }

  function setupPlayer(streamUrl, videoId, nextVideoId) {
    const video = videos[videoId];
    if (!player || !video) return;

    const wasPlaying = Boolean(playerState && !player.paused && !player.ended);
    if (playerState && playerState.videoId !== videoId && player.currentTime > 0) {
      saveProgress(playerState.videoId, player.currentTime, true);
    }

    destroyHls();
    player.pause();
    player.onloadedmetadata = null;
    player.ontimeupdate = null;
    player.onpause = null;
    player.onended = null;
    player.onerror = null;
    player.removeAttribute('src');
    try { player.load(); } catch (_error) { /* ignored */ }

    const url = String(streamUrl || '').trim();
    playerState = {
      videoId,
      nextVideoId: nextVideoId || '',
      title: video.title,
      playlistTitle: video.playlistTitle,
      categoryTitle: video.categoryTitle,
      streamUrl: url
    };
    player.poster = safeUrl(video.thumbnail);
    persistentPlayer.hidden = false;
    updateMiniPlayerCopy();
    updateProgressVisuals(videoId, getProgress(videoId));

    if (!url) {
      showToast('No playback URL is available for this video.');
      return;
    }

    const saved = getProgress(videoId);
    const restoreTime = () => {
      const duration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : Number(video.durationSeconds || 0);
      if (saved > 1 && Number.isFinite(saved) && (!duration || saved < duration - 2)) {
        try { player.currentTime = saved; } catch (_error) { /* ignored */ }
      }
      updateProgressVisuals(videoId, saved);
      if (wasPlaying) player.play().catch(() => {});
    };

    player.onloadedmetadata = restoreTime;
    player.ontimeupdate = () => {
      if (!playerState || playerState.videoId !== videoId || player.currentTime < 0) return;
      saveProgress(videoId, player.currentTime, false);
    };
    player.onpause = () => {
      if (playerState && playerState.videoId === videoId && player.currentTime > 0) saveProgress(videoId, player.currentTime, true);
    };
    player.onended = () => {
      saveProgress(videoId, player.duration || video.durationSeconds || player.currentTime, true);
      premiumHaptic('success');
      if (playerState && playerState.nextVideoId) navigate('watch', playerState.nextVideoId);
    };
    player.onerror = () => showToast('Playback is unavailable or blocked for this video.');

    if (player.canPlayType('application/vnd.apple.mpegurl')) {
      player.src = url;
    } else if (window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({ maxBufferLength: 45, enableWorker: true });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(player);
      hlsInstance.on(window.Hls.Events.ERROR, function (_event, data) {
        if (data && data.fatal) showToast('Playback is unavailable or blocked for this video.');
      });
    } else {
      showToast('This browser does not support HLS playback.');
    }

    dockPlayerInWatchPage();
    observeWatchPlayerMount();
  }

  function activeFolderForRoute(route) {
    if (route.kind === 'folder') return route.id;
    if (route.kind === 'playlist' && playlists[route.id]) return playlists[route.id].parentId || playlists[route.id].categoryId;
    if (route.kind === 'watch' && videos[route.id]) return videos[route.id].folderId || videos[route.id].categoryId;
    return null;
  }

  function updateBottomNav(route) {
    document.querySelectorAll('.mobile-bottom-nav a').forEach(link => link.classList.remove('active'));
    const key = route.kind === 'search' ? 'search' : route.kind === 'library' ? 'library' : 'home';
    const active = document.querySelector(`.mobile-bottom-nav [data-nav="${key}"]`);
    if (active) active.classList.add('active');
  }

  function updateDocumentTitle(route) {
    let title = 'NCLEX Play';
    if (route.kind === 'watch' && videos[route.id]) title = `${videos[route.id].title} · NCLEX Play`;
    else if (route.kind === 'playlist' && playlists[route.id]) title = `${playlists[route.id].title} · NCLEX Play`;
    else if (route.kind === 'folder' && folders[route.id]) title = `${folders[route.id].title} · NCLEX Play`;
    else if (route.kind === 'search') title = `${route.id || 'Search'} · NCLEX Play`;
    else if (route.kind === 'library') title = 'Library · NCLEX Play';
    document.title = title;
  }

  function render() {
    const route = parseRoute();
    preparePlayerForRender(route);
    renderSidebar(route, activeFolderForRoute(route));

    if (route.kind === 'folder') renderFolder(route.id);
    else if (route.kind === 'playlist') renderPlaylist(route.id);
    else if (route.kind === 'watch') renderWatch(route.id);
    else if (route.kind === 'search') renderSearch(route.id);
    else if (route.kind === 'library') renderLibrary();
    else renderHome();

    updateBottomNav(route);
    updateDocumentTitle(route);
    closeMobileNav();
    if (route.kind !== 'search') {
      searchInput.value = '';
      updateSearchState();
      closeMobileSearch();
    }
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function openMobileNav() {
    document.body.classList.add('nav-open');
  }

  function closeMobileNav() {
    document.body.classList.remove('nav-open');
  }

  function openMobileSearch() {
    document.body.classList.add('search-open');
    requestAnimationFrame(() => searchInput.focus());
  }

  function closeMobileSearch() {
    document.body.classList.remove('search-open');
  }

  function updateSearchState() {
    searchForm.classList.toggle('has-value', Boolean(searchInput.value));
  }

  function updateThemeButton() {
    const light = document.body.classList.contains('light');
    $('#themeToggle').innerHTML = light ? icon('moon') : icon('sun');
    $('#themeToggle').setAttribute('aria-label', light ? 'Use dark theme' : 'Use light theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#ffffff' : '#0f0f0f');
  }

  $('#menuButton').innerHTML = icon('menu');
  $('.search-submit').innerHTML = icon('search');
  $('#mobileSearchButton').innerHTML = icon('search');
  $('#searchBack').innerHTML = icon('back');
  $('#clearSearch').innerHTML = icon('close');
  $('#miniPlayerClose').innerHTML = icon('close');
  document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  updateNotificationButton();

  $('#menuButton').addEventListener('click', function () {
    if (window.matchMedia('(max-width: 980px)').matches) openMobileNav();
    else {
      document.body.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem('nclex:sidebar', document.body.classList.contains('sidebar-collapsed') ? 'collapsed' : 'open'); } catch (_error) { /* ignored */ }
    }
  });

  $('#mobileShade').addEventListener('click', closeMobileNav);
  $('#mobileSearchButton').addEventListener('click', openMobileSearch);
  $('#searchBack').addEventListener('click', closeMobileSearch);
  $('#clearSearch').addEventListener('click', function () {
    searchInput.value = '';
    updateSearchState();
    searchInput.focus();
    if (parseRoute().kind === 'search') navigate('search', '');
  });


  $('#miniPlayerClose').addEventListener('click', closePersistentPlayer);
  $('#miniPlayerExpand').addEventListener('click', function () {
    if (!playerState) return;
    premiumHaptic('select');
    const route = parseRoute();
    if (route.kind === 'watch' && route.id === playerState.videoId) {
      dockPlayerInWatchPage();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      observeWatchPlayerMount();
    } else navigate('watch', playerState.videoId);
  });

  notificationButton.addEventListener('click', function () {
    if (notificationIsEnabled()) disableNotifications();
    else {
      premiumHaptic('select');
      notificationPrompt.hidden = false;
    }
  });

  $('#notificationEnable').addEventListener('click', enableNotifications);
  $('#notificationLater').addEventListener('click', function () {
    notificationPrompt.hidden = true;
    try { localStorage.setItem('nclex:notification:dismissed:v1', String(Date.now())); } catch (_error) { /* ignored */ }
    premiumHaptic('close');
  });

  $('#themeToggle').addEventListener('click', function () {
    document.body.classList.toggle('light');
    try { localStorage.setItem('nclex:theme', document.body.classList.contains('light') ? 'light' : 'dark'); } catch (_error) { /* ignored */ }
    updateThemeButton();
  });

  searchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    navigate('search', searchInput.value.trim());
  });

  searchInput.addEventListener('input', function () {
    updateSearchState();
    const query = searchInput.value.trim();
    clearTimeout(searchInput.timer);
    searchInput.timer = setTimeout(() => {
      if (query.length >= 2) navigate('search', query);
      else if (!query && parseRoute().kind === 'search') navigate('search', '');
    }, 320);
  });

  document.querySelector('[data-nav="search"]').addEventListener('click', function (event) {
    if (window.matchMedia('(max-width: 720px)').matches) {
      event.preventDefault();
      openMobileSearch();
    }
  });

  document.addEventListener('keydown', function (event) {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (event.key === '/' && !typing) {
      event.preventDefault();
      if (window.matchMedia('(max-width: 720px)').matches) openMobileSearch();
      else searchInput.focus();
    }
    if (event.key === 'Escape') {
      closeMobileNav();
      closeMobileSearch();
      if (document.activeElement === searchInput) searchInput.blur();
    }
    if ((event.key === 'k' || event.key === 'K') && !typing) {
      const player = $('#player');
      if (player) {
        event.preventDefault();
        if (player.paused) player.play().catch(() => {}); else player.pause();
      }
    }
  });

  document.addEventListener('pointerdown', function (event) {
    if (event.button != null && event.button !== 0) return;
    const target = event.target.closest('button, a, [role="button"], input[type="checkbox"], input[type="radio"]');
    if (!target || target.disabled) return;
    premiumHaptic(target.matches('.button.primary, .video-card a, .video-row, .playlist-card a') ? 'select' : 'tap');
  }, { passive: true });

  document.addEventListener('scroll', function (event) {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const now = performance.now();
    if (now - lastScrollHapticAt < 130) return;
    const target = event.target;
    const position = target === document ? window.scrollY : Number(target.scrollTop || 0) + Number(target.scrollLeft || 0);
    if (Math.abs(position - lastScrollHapticY) < 170) return;
    lastScrollHapticY = position;
    lastScrollHapticAt = now;
    premiumHaptic('scroll');
  }, { passive: true, capture: true });

  player.addEventListener('play', () => premiumHaptic('select'));
  player.addEventListener('pause', () => {
    if (!player.ended) premiumHaptic('feather');
  });
  player.addEventListener('seeking', () => premiumHaptic('feather'));

  window.addEventListener('pagehide', function () {
    if (playerState && player.currentTime > 0) saveProgress(playerState.videoId, player.currentTime, true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (playerState && player.currentTime > 0) saveProgress(playerState.videoId, player.currentTime, true);
    } else if (notificationIsEnabled()) {
      showMotivationNotification(false);
      scheduleHourlyMotivation();
    }
  });

  window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 6), { passive: true });
  window.addEventListener('hashchange', render);
  window.addEventListener('resize', function () {
    if (!window.matchMedia('(max-width: 980px)').matches) closeMobileNav();
    if (!window.matchMedia('(max-width: 720px)').matches) closeMobileSearch();
  });

  try {
    if (localStorage.getItem('nclex:theme') === 'light') document.body.classList.add('light');
    if (localStorage.getItem('nclex:sidebar') === 'collapsed') document.body.classList.add('sidebar-collapsed');
  } catch (_error) { /* ignored */ }

  updateThemeButton();
  updateSearchState();
  installContentProtection();
  if (!location.hash) location.hash = '#home';
  render();

  maybeShowNotificationPrompt();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('service-worker.js').then(async () => {
      updateNotificationButton();
      if (notificationIsEnabled()) {
        await registerPeriodicMotivation();
        await showMotivationNotification(false);
        scheduleHourlyMotivation();
      }
    }).catch(() => {});
  }
})();
