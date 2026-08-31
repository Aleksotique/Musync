/* =========================================================
   Musique Hors Ligne — logique de l'application
   Tout est local : IndexedDB pour le stockage, aucun appel réseau.
   ========================================================= */

/* ---------- Petites icônes SVG (blanches via currentColor) ---------- */
const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l10-7zM17 5h2v14h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 5v14L8 12zM5 5h2v14H5z"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  remove: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 11h14v2H5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.4 7.4 14 6l-4 4-4-4-1.4 1.4 4 4-4 4L6 18l4-4 4 4 1.4-1.4-4-4z"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
};

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* =========================================================
   IndexedDB — stockage local des morceaux et playlists
   ========================================================= */
const DB_NAME = 'musicAppDB';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('playlists')) {
        db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function dbTx(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function dbAdd(storeName, obj) {
  const store = await dbTx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.add(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(storeName, obj) {
  const store = await dbTx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(obj);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, id) {
  const store = await dbTx(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(storeName) {
  const store = await dbTx(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(storeName, id) {
  const store = await dbTx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* =========================================================
   Lecteur ID3 minimal (v2.3 / v2.4) — titre, artiste, album, pochette
   ========================================================= */
function readSynchsafe(b, o) {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}
function readUInt32(b, o) {
  return (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}
function decodeText(bytes, encoding) {
  let label = 'iso-8859-1';
  if (encoding === 1) label = 'utf-16';
  else if (encoding === 2) label = 'utf-16be';
  else if (encoding === 3) label = 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes).replace(/\u0000+$/, '').trim();
  } catch {
    return '';
  }
}
function parseAPIC(bytes) {
  let offset = 0;
  const encoding = bytes[offset]; offset += 1;
  let mimeEnd = offset;
  while (mimeEnd < bytes.length && bytes[mimeEnd] !== 0) mimeEnd++;
  const mime = decodeText(bytes.slice(offset, mimeEnd), 0) || 'image/jpeg';
  offset = mimeEnd + 1;
  offset += 1; // picture type byte
  let descEnd = offset;
  if (encoding === 1 || encoding === 2) {
    while (descEnd + 1 < bytes.length && !(bytes[descEnd] === 0 && bytes[descEnd + 1] === 0)) descEnd += 2;
    offset = descEnd + 2;
  } else {
    while (descEnd < bytes.length && bytes[descEnd] !== 0) descEnd++;
    offset = descEnd + 1;
  }
  const imageData = bytes.slice(offset);
  return { mime, blob: new Blob([imageData], { type: mime }) };
}

async function parseID3(file) {
  const result = { title: null, artist: null, album: null, picture: null };
  try {
    const headBuf = await file.slice(0, 10).arrayBuffer();
    const head = new Uint8Array(headBuf);
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return result; // pas "ID3"
    const majorVersion = head[3];
    const flags = head[5];
    const tagSize = readSynchsafe(head, 6);

    const bodyBuf = await file.slice(10, 10 + tagSize).arrayBuffer();
    const bytes = new Uint8Array(bodyBuf);
    let pos = 0;

    if (flags & 0x40) { // extended header présent
      const extSize = majorVersion >= 4 ? readSynchsafe(bytes, 0) : readUInt32(bytes, 0);
      pos += extSize;
    }

    while (pos + 10 <= bytes.length) {
      const frameId = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      if (frameId === '\0\0\0\0') break;
      const frameSize = majorVersion >= 4 ? readSynchsafe(bytes, pos + 4) : readUInt32(bytes, pos + 4);
      const frameStart = pos + 10;
      if (frameSize <= 0 || frameStart + frameSize > bytes.length) break;
      const frameBytes = bytes.slice(frameStart, frameStart + frameSize);

      if (frameId === 'TIT2' && frameBytes.length > 1) {
        result.title = decodeText(frameBytes.slice(1), frameBytes[0]);
      } else if (frameId === 'TPE1' && frameBytes.length > 1) {
        result.artist = decodeText(frameBytes.slice(1), frameBytes[0]);
      } else if (frameId === 'TALB' && frameBytes.length > 1) {
        result.album = decodeText(frameBytes.slice(1), frameBytes[0]);
      } else if (frameId === 'APIC' && !result.picture) {
        try { result.picture = parseAPIC(frameBytes); } catch { /* ignore image parsing errors */ }
      }
      pos = frameStart + frameSize;
    }
  } catch {
    /* fichier sans ID3 lisible : on retombera sur le nom de fichier */
  }
  return result;
}

/* =========================================================
   État global + cache des URLs d'objets (pochettes/audio)
   ========================================================= */
const state = {
  view: 'library',
  currentPlaylistId: null,
  queue: [],        // liste d'ids de morceaux
  queueLabel: '',
  currentIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isSeeking: false,
  pickerMode: null,  // 'choose-playlist' | 'pick-tracks'
  pickerTrackId: null
};

const pictureUrlCache = new Map(); // trackId -> object URL de la pochette
const audioUrlCache = new Map();   // trackId -> object URL du fichier audio

function getPictureUrl(track) {
  if (!track.picture) return null;
  if (pictureUrlCache.has(track.id)) return pictureUrlCache.get(track.id);
  const url = URL.createObjectURL(track.picture.blob);
  pictureUrlCache.set(track.id, url);
  return url;
}
function getAudioUrl(track) {
  if (audioUrlCache.has(track.id)) return audioUrlCache.get(track.id);
  const url = URL.createObjectURL(track.blob);
  audioUrlCache.set(track.id, url);
  return url;
}

/* =========================================================
   Références DOM
   ========================================================= */
const el = (id) => document.getElementById(id);
const audio = el('audio');

const views = {
  library: el('view-library'),
  playlists: el('view-playlists'),
  'playlist-detail': el('view-playlist-detail')
};

/* =========================================================
   Rendu : bibliothèque
   ========================================================= */
function buildTrackRow(track, { onRowAction, actionIcon }) {
  const li = document.createElement('li');
  li.className = 'row';

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const picUrl = getPictureUrl(track);
  if (picUrl) {
    thumb.style.backgroundImage = `url("${picUrl}")`;
  } else {
    thumb.innerHTML = ICONS.note;
  }

  const text = document.createElement('div');
  text.className = 'row-text';
  text.innerHTML = `<div class="row-title"></div><div class="row-sub"></div>`;
  text.querySelector('.row-title').textContent = track.title || 'Titre inconnu';
  text.querySelector('.row-sub').textContent = track.artist || 'Artiste inconnu';

  li.appendChild(thumb);
  li.appendChild(text);

  if (onRowAction) {
    const action = document.createElement('button');
    action.className = 'row-action';
    action.innerHTML = actionIcon;
    action.addEventListener('click', (e) => { e.stopPropagation(); onRowAction(track); });
    li.appendChild(action);
  }

  return li;
}

async function renderLibrary() {
  const tracks = await dbGetAll('tracks');
  tracks.sort((a, b) => b.addedAt - a.addedAt);
  const list = el('library-list');
  list.innerHTML = '';
  el('library-empty').style.display = tracks.length ? 'none' : 'block';

  tracks.forEach((track, index) => {
    const row = buildTrackRow(track, {
      onRowAction: (t) => openPicker('choose-playlist', t.id),
      actionIcon: ICONS.add
    });
    row.addEventListener('click', () => {
      playQueue(tracks.map(t => t.id), index, 'Bibliothèque');
    });
    list.appendChild(row);
  });
}

/* ---------- Rendu : playlists ---------- */
async function renderPlaylists() {
  const playlists = await dbGetAll('playlists');
  playlists.sort((a, b) => b.createdAt - a.createdAt);
  const list = el('playlists-list');
  list.innerHTML = '';
  el('playlists-empty').style.display = playlists.length ? 'none' : 'block';

  playlists.forEach((pl) => {
    const li = document.createElement('li');
    li.className = 'row';
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    thumb.innerHTML = ICONS.note;
    const text = document.createElement('div');
    text.className = 'row-text';
    text.innerHTML = `<div class="row-title"></div><div class="row-sub"></div>`;
    text.querySelector('.row-title').textContent = pl.name;
    text.querySelector('.row-sub').textContent = `${pl.trackIds.length} morceau${pl.trackIds.length > 1 ? 'x' : ''}`;
    li.appendChild(thumb);
    li.appendChild(text);
    li.addEventListener('click', () => openPlaylistDetail(pl.id));
    list.appendChild(li);
  });
}

async function openPlaylistDetail(playlistId) {
  state.currentPlaylistId = playlistId;
  switchView('playlist-detail');
  await renderPlaylistDetail();
}

async function renderPlaylistDetail() {
  const playlist = await dbGet('playlists', state.currentPlaylistId);
  if (!playlist) { switchView('playlists'); return; }
  el('playlist-detail-title').textContent = playlist.name;

  const allTracks = await dbGetAll('tracks');
  const trackMap = new Map(allTracks.map(t => [t.id, t]));
  const tracks = playlist.trackIds.map(id => trackMap.get(id)).filter(Boolean);

  const list = el('playlist-detail-list');
  list.innerHTML = '';
  el('playlist-detail-empty').style.display = tracks.length ? 'none' : 'block';

  tracks.forEach((track, index) => {
    const row = buildTrackRow(track, {
      onRowAction: async (t) => {
        playlist.trackIds = playlist.trackIds.filter(id => id !== t.id);
        await dbPut('playlists', playlist);
        renderPlaylistDetail();
      },
      actionIcon: ICONS.remove
    });
    row.addEventListener('click', () => {
      playQueue(tracks.map(t => t.id), index, playlist.name);
    });
    list.appendChild(row);
  });
}

/* =========================================================
   Sheet générique (choisir une playlist / ajouter des morceaux)
   ========================================================= */
async function openPicker(mode, contextId) {
  state.pickerMode = mode;
  const backdrop = el('sheet-picker');
  const listEl = el('picker-list');
  const doneBtn = el('picker-done');
  listEl.innerHTML = '';

  if (mode === 'choose-playlist') {
    el('picker-title').textContent = 'Ajouter à une playlist';
    doneBtn.style.display = 'none';
    const playlists = await dbGetAll('playlists');
    if (!playlists.length) {
      listEl.innerHTML = '<div class="empty-state">Crée d\'abord une playlist depuis l\'onglet Playlists.</div>';
    }
    playlists.forEach((pl) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.innerHTML = `<div class="row-text"><div class="row-title"></div></div>`;
      li.querySelector('.row-title').textContent = pl.name;
      li.addEventListener('click', async () => {
        if (!pl.trackIds.includes(contextId)) {
          pl.trackIds.push(contextId);
          await dbPut('playlists', pl);
        }
        closePicker();
      });
      listEl.appendChild(li);
    });
  }

  if (mode === 'pick-tracks') {
    el('picker-title').textContent = 'Ajouter des musiques';
    doneBtn.style.display = 'block';
    const playlist = await dbGet('playlists', contextId);
    const tracks = await dbGetAll('tracks');
    tracks.sort((a, b) => b.addedAt - a.addedAt);
    tracks.forEach((track) => {
      const li = document.createElement('li');
      li.className = 'row';
      const inPlaylist = playlist.trackIds.includes(track.id);
      li.innerHTML = `<div class="row-text"><div class="row-title"></div></div><div class="row-action"></div>`;
      li.querySelector('.row-title').textContent = track.title || 'Titre inconnu';
      const actionEl = li.querySelector('.row-action');
      actionEl.innerHTML = inPlaylist ? ICONS.check : ICONS.add;
      li.addEventListener('click', async () => {
        const nowIn = playlist.trackIds.includes(track.id);
        if (nowIn) {
          playlist.trackIds = playlist.trackIds.filter(id => id !== track.id);
        } else {
          playlist.trackIds.push(track.id);
        }
        await dbPut('playlists', playlist);
        actionEl.innerHTML = playlist.trackIds.includes(track.id) ? ICONS.check : ICONS.add;
      });
      listEl.appendChild(li);
    });
    doneBtn.onclick = () => { closePicker(); renderPlaylistDetail(); };
  }

  backdrop.classList.add('open');
}
function closePicker() {
  el('sheet-picker').classList.remove('open');
}

/* =========================================================
   Import de fichiers
   ========================================================= */
async function handleFiles(fileList) {
  for (const file of fileList) {
    const tags = await parseID3(file);
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    await dbAdd('tracks', {
      title: tags.title || nameWithoutExt,
      artist: tags.artist || 'Artiste inconnu',
      album: tags.album || '',
      blob: file,
      picture: tags.picture || null,
      addedAt: Date.now()
    });
  }
  await renderLibrary();
}

/* =========================================================
   Lecteur audio + Media Session (contrôles écran verrouillé)
   ========================================================= */
async function playQueue(trackIds, startIndex, label) {
  state.queue = trackIds;
  state.queueLabel = label;
  await loadAndPlay(startIndex);
}

async function loadAndPlay(index) {
  if (!state.queue.length) return;
  const wrapped = (index + state.queue.length) % state.queue.length;
  const trackId = state.queue[wrapped];
  const track = await dbGet('tracks', trackId);
  if (!track) return;

  state.currentIndex = wrapped;
  state.currentTrack = track;

  audio.src = getAudioUrl(track);
  try { await audio.play(); } catch { /* lecture bloquée tant que l'utilisateur n'a pas interagi */ }

  updateMiniPlayer();
  updateNowPlayingMeta();
  updateMediaSession();
}

function playPause() {
  if (!state.currentTrack) return;
  if (audio.paused) audio.play(); else audio.pause();
}
function next() { loadAndPlay(state.currentIndex + 1); }
function prev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  loadAndPlay(state.currentIndex - 1);
}
function seekToFraction(fraction) {
  if (!isFinite(audio.duration)) return;
  audio.currentTime = fraction * audio.duration;
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !state.currentTrack) return;
  const track = state.currentTrack;
  const picUrl = getPictureUrl(track);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || 'Titre inconnu',
    artist: track.artist || '',
    album: track.album || '',
    artwork: picUrl ? [{ src: picUrl, sizes: '512x512', type: track.picture.mime }] : []
  });
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', prev);
  navigator.mediaSession.setActionHandler('nexttrack', next);
}

/* ---------- Mini player ---------- */
function updateMiniPlayer() {
  const track = state.currentTrack;
  const bar = el('miniplayer');
  if (!track) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  const picUrl = getPictureUrl(track);
  const thumb = el('mini-thumb');
  thumb.style.backgroundImage = picUrl ? `url("${picUrl}")` : '';
  thumb.innerHTML = picUrl ? '' : ICONS.note;
  el('mini-title').textContent = track.title || 'Titre inconnu';
  el('mini-artist').textContent = track.artist || 'Artiste inconnu';
}

/* ---------- Écran plein écran "En cours de lecture" ---------- */
function updateNowPlayingMeta() {
  const track = state.currentTrack;
  if (!track) return;
  const picUrl = getPictureUrl(track);
  const bg = el('np-bg');
  const art = el('np-art');
  if (picUrl) {
    bg.classList.remove('fallback');
    bg.style.backgroundImage = `url("${picUrl}")`;
    art.style.backgroundImage = `url("${picUrl}")`;
    art.innerHTML = '';
  } else {
    bg.classList.add('fallback');
    bg.style.backgroundImage = '';
    art.style.backgroundImage = '';
    art.innerHTML = ICONS.note;
  }
  el('np-title').textContent = track.title || 'Titre inconnu';
  el('np-artist').textContent = track.artist || 'Artiste inconnu';
  el('np-queue-label').textContent = state.queueLabel || '';
}

function updatePlayIcons() {
  const icon = state.isPlaying ? ICONS.pause : ICONS.play;
  el('mini-playpause').innerHTML = icon;
  el('np-playpause').innerHTML = icon;
}

function openNowPlaying() { el('nowplaying').classList.add('open'); }
function closeNowPlaying() { el('nowplaying').classList.remove('open'); }

/* =========================================================
   Navigation entre vues
   ========================================================= */
function switchView(name) {
  state.view = name;
  Object.entries(views).forEach(([key, node]) => {
    node.classList.toggle('active', key === name);
  });
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });
}

/* =========================================================
   Câblage des évènements
   ========================================================= */
function wireEvents() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  el('btn-import').addEventListener('click', () => el('file-input').click());
  el('file-input').addEventListener('change', (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
    e.target.value = '';
  });

  el('btn-new-playlist').addEventListener('click', () => {
    el('new-playlist-name').value = '';
    el('sheet-new-playlist').classList.add('open');
  });
  el('confirm-new-playlist').addEventListener('click', async () => {
    const name = el('new-playlist-name').value.trim();
    if (!name) return;
    await dbAdd('playlists', { name, trackIds: [], createdAt: Date.now() });
    el('sheet-new-playlist').classList.remove('open');
    renderPlaylists();
  });

  el('btn-back-playlists').addEventListener('click', () => switchView('playlists'));
  el('btn-add-tracks-to-playlist').addEventListener('click', () => {
    openPicker('pick-tracks', state.currentPlaylistId);
  });
  el('btn-delete-playlist').addEventListener('click', async () => {
    if (!confirm('Supprimer cette playlist ?')) return;
    await dbDelete('playlists', state.currentPlaylistId);
    switchView('playlists');
    renderPlaylists();
  });

  document.querySelectorAll('.sheet-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('open');
    });
  });

  el('mini-playpause').addEventListener('click', playPause);
  el('mini-next').addEventListener('click', next);
  el('mini-open-now-playing').addEventListener('click', openNowPlaying);

  el('np-close').addEventListener('click', closeNowPlaying);
  el('np-playpause').addEventListener('click', playPause);
  el('np-next').addEventListener('click', next);
  el('np-prev').addEventListener('click', prev);

  const seek = el('np-seek');
  seek.addEventListener('input', () => { state.isSeeking = true; });
  seek.addEventListener('change', () => {
    seekToFraction(Number(seek.value) / 1000);
    state.isSeeking = false;
  });

  audio.addEventListener('play', () => { state.isPlaying = true; updatePlayIcons(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayIcons(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
  audio.addEventListener('ended', next);
  audio.addEventListener('timeupdate', () => {
    if (state.isSeeking || !isFinite(audio.duration)) return;
    el('np-seek').value = String((audio.currentTime / audio.duration) * 1000);
    el('np-time-current').textContent = formatTime(audio.currentTime);
    el('np-time-total').textContent = formatTime(audio.duration);
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime
        });
      } catch { /* ignorer si l'état n'est pas encore valide */ }
    }
  });
}

/* =========================================================
   Démarrage
   ========================================================= */
wireEvents();
renderLibrary();
renderPlaylists();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* pas grave si indisponible */ });
  });
}
