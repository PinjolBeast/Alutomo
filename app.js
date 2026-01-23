const audio = document.getElementById('audio');
const video = document.getElementById('video');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const seek = document.getElementById('seek');
const volume = document.getElementById('volume');
const tracksEl = document.getElementById('tracks');
const nowTitle = document.getElementById('now-title');
const nowArtist = document.getElementById('now-artist');
const fileInput = document.getElementById('file-input');
const videoUrl = document.getElementById('video-url');
const downloadFormat = document.getElementById('download-format');
const downloadBtn = document.getElementById('download-btn');
const downloadStatus = document.getElementById('download-status');

let playlist = [];
let current = -1;
let currentMediaType = 'audio'; // 'audio' or 'video'
let currentPlaylistName = 'My Music';
let playlists = { 'My Music': [] };

function isVideoFile(filename) {
  const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.wmv'];
  return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function getCurrentMediaElement() {
  return currentMediaType === 'video' ? video : audio;
}

function loadSongsManifest(){
  // Try to load from server first
  return fetch('songs.json').then(r=>{
    if(!r.ok) throw new Error('manifest fetch failed');
    return r.json();
  }).then(data=>{
    playlists = data.playlists || { 'My Music': [] };
    currentPlaylistName = data.currentPlaylist || 'My Music';
    playlist = playlists[currentPlaylistName] || [];
    
    // Save to localStorage for offline use
    localStorage.setItem('playlists', JSON.stringify(playlists));
    localStorage.setItem('currentPlaylist', currentPlaylistName);
    
    renderPlaylist();
    renderPlaylistSelector();
    updateNowUI(); // Make sure UI updates
    return playlist;
  }).catch(async (err)=>{
    console.log('Server not available, loading from localStorage:', err.message);
    
    // Fall back to localStorage
    const savedPlaylists = localStorage.getItem('playlists');
    const savedCurrent = localStorage.getItem('currentPlaylist');
    
    if(savedPlaylists){
      playlists = JSON.parse(savedPlaylists);
      currentPlaylistName = savedCurrent || 'My Music';
      playlist = playlists[currentPlaylistName] || [];
      
      // Restore object URLs for local files
      for(let i = 0; i < playlist.length; i++){
        const song = playlist[i];
        if(song.localFile && song.filename){
          try {
            const file = await getFile(song.filename);
            if(file){
              const url = URL.createObjectURL(file);
              playlist[i].file = url;
              playlist[i].url = url;
            }
          } catch (error) {
            console.warn('Failed to restore file:', song.filename, error);
          }
        }
      }
    } else {
      playlists = { 'My Music': [] };
      currentPlaylistName = 'My Music';
      playlist = [];
    }
    
    renderPlaylist();
    renderPlaylistSelector();
    updateNowUI(); // Make sure UI updates
    return playlist;
  });
}

function renderPlaylist(){
  tracksEl.innerHTML='';
  playlist.forEach((s,i)=>{
    const li = document.createElement('li');
    const isVideo = s.type === 'video' || isVideoFile(s.title || s.file || '');
    const icon = isVideo ? '🎥 ' : '🎵 ';
    
    // Song info container
    const songInfo = document.createElement('div');
    songInfo.style.flex = '1';
    songInfo.textContent = icon + (s.title || s.file || ('Track '+(i+1)));
    songInfo.addEventListener('click', ()=> playIndex(i));
    
    const meta = document.createElement('div');
    meta.style.opacity=0.7;meta.style.fontSize='13px';meta.textContent = s.artist||'';
    songInfo.appendChild(meta);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.className = 'delete-btn';
    deleteBtn.title = 'Delete song';
    deleteBtn.addEventListener('click', (e)=> {
      e.stopPropagation();
      deleteSong(i);
    });
    
    li.dataset.index = i;
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.justifyContent = 'space-between';
    li.appendChild(songInfo);
    li.appendChild(deleteBtn);
    tracksEl.appendChild(li);
  });
  updateNowUI();
}

function renderPlaylistSelector(){
  const selector = document.getElementById('playlist-selector');
  if(!selector) return;
  
  selector.innerHTML = '';
  
  Object.keys(playlists).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if(name === currentPlaylistName) option.selected = true;
    selector.appendChild(option);
  });
}

function switchPlaylist(name){
  if(!playlists[name]) return;
  currentPlaylistName = name;
  playlist = playlists[name];
  current = -1;
  renderPlaylist();
  updateNowUI();
  
  // Save to localStorage
  localStorage.setItem('currentPlaylist', currentPlaylistName);
  
  // Try to save to server
  fetch('/set-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPlaylist: name })
  }).catch(err => {
    console.log('Server not available, playlist switch saved locally');
  });
}

function createPlaylist(){
  const name = prompt('Enter playlist name:');
  if(!name || !name.trim()) return;
  
  const trimmedName = name.trim();
  if(playlists[trimmedName]){
    alert('Playlist already exists!');
    return;
  }
  
  playlists[trimmedName] = [];
  localStorage.setItem('playlists', JSON.stringify(playlists));
  renderPlaylistSelector();
  
  // Try to save to server
  fetch('/create-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmedName })
  }).catch(err => {
    console.log('Server not available, playlist created locally');
  });
}

function deletePlaylist(){
  if(Object.keys(playlists).length <= 1){
    alert('Cannot delete the last playlist!');
    return;
  }
  
  if(!confirm(`Delete playlist "${currentPlaylistName}"?`)) return;
  
  delete playlists[currentPlaylistName];
  localStorage.setItem('playlists', JSON.stringify(playlists));
  currentPlaylistName = Object.keys(playlists)[0];
  playlist = playlists[currentPlaylistName];
  current = -1;
  renderPlaylist();
  renderPlaylistSelector();
  updateNowUI();
  
  // Try to save to server
  fetch('/delete-playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: currentPlaylistName })
  }).catch(err => {
    console.log('Server not available, playlist deleted locally');
  });
}

function deleteSong(index){
  if(index < 0 || index >= playlist.length) return;
  
  const song = playlist[index];
  const confirmed = confirm(`Delete "${song.title || song.file}"?`);
  if(!confirmed) return;
  
  // Try to delete from server first
  fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, file: song.file })
  }).then(r => r.json()).then(result => {
    if(result.ok){
      // Remove from local playlist
      playlist.splice(index, 1);
      playlists[currentPlaylistName] = playlist;
      localStorage.setItem('playlists', JSON.stringify(playlists));
      
      // Force re-render
      renderPlaylist();
      
      // If we deleted the currently playing song, stop playback
      if(current === index){
        current = -1;
        updateNowUI();
      } else if(current > index){
        current--;
      }
    } else {
      alert('Failed to delete song: ' + result.message);
    }
  }).catch(err => {
    console.log('Server not available, deleting locally');
    // Delete locally if server is not available
    if(song.localFile && song.filename){
      // Delete from IndexedDB
      deleteFile(song.filename).catch(e => console.warn('Failed to delete file from storage:', e));
    }
    
    playlist.splice(index, 1);
    playlists[currentPlaylistName] = playlist;
    localStorage.setItem('playlists', JSON.stringify(playlists));
    
    // Force re-render
    renderPlaylist();
    
    // If we deleted the currently playing song, stop playback
    if(current === index){
      current = -1;
      updateNowUI();
    } else if(current > index){
      current--;
    }
  });
}

function playIndex(i){
  if(i<0||i>=playlist.length) return;
  current = i;
  const track = playlist[i];
  const src = track.url || track.file;
  
  // Determine media type
  const filename = track.title || track.file || src;
  currentMediaType = isVideoFile(filename) ? 'video' : 'audio';
  
  // Show/hide appropriate media element
  if (currentMediaType === 'video') {
    video.style.display = 'block';
    audio.style.display = 'none';
    video.src = src;
    video.play();
  } else {
    audio.style.display = 'block';
    video.style.display = 'none';
    audio.src = src;
    audio.play();
  }
  
  highlightPlaying();
  updateNowUI();
}

function highlightPlaying(){
  document.querySelectorAll('#tracks li').forEach(li=>li.classList.remove('playing'));
  if(current>=0){
    const el = document.querySelector(`#tracks li[data-index='${current}']`);
    if(el) el.classList.add('playing');
  }
}

function updateNowUI(){
  const t = playlist[current];
  nowTitle.textContent = t ? (t.title || t.file || 'Unknown') : (playlist.length > 0 ? 'Select a song to play' : 'No songs in playlist');
  nowArtist.textContent = t ? (t.artist || '') : '';
}

playBtn.addEventListener('click', ()=>{
  const media = getCurrentMediaElement();
  if(media.paused){
    media.play();
  } else media.pause();
});

prevBtn.addEventListener('click', ()=>{
  if(playlist.length===0) return;
  let nextIdx = current-1; if(nextIdx<0) nextIdx = playlist.length-1;
  playIndex(nextIdx);
});

nextBtn.addEventListener('click', ()=>{
  if(playlist.length===0) return;
  let nextIdx = current+1; if(nextIdx>=playlist.length) nextIdx = 0;
  playIndex(nextIdx);
});

audio.addEventListener('play', ()=> playBtn.textContent='Pause');
audio.addEventListener('pause', ()=> playBtn.textContent='Play');
audio.addEventListener('timeupdate', ()=>{
  if(audio.duration){
    seek.value = (audio.currentTime / audio.duration) * 100;
  }
});
audio.addEventListener('ended', ()=> nextBtn.click());

video.addEventListener('play', ()=> playBtn.textContent='Pause');
video.addEventListener('pause', ()=> playBtn.textContent='Play');
video.addEventListener('timeupdate', ()=>{
  if(video.duration){
    seek.value = (video.currentTime / video.duration) * 100;
  }
});
video.addEventListener('ended', ()=> nextBtn.click());

seek.addEventListener('input', ()=>{
  const media = getCurrentMediaElement();
  if(media.duration) media.currentTime = (seek.value/100) * media.duration;
});

volume.addEventListener('input', ()=>{
  const media = getCurrentMediaElement();
  media.volume = volume.value;
});

fileInput.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files);
  // attempt to upload to server if available
  try{
    const form = new FormData();
    files.forEach(f=> form.append('files', f));
    const res = await fetch('/upload', { method: 'POST', body: form });
    if(res && res.ok){
      // refresh playlist from songs.json on server
      await loadSongsManifest();
      playIndex(playlist.length-1);
      return;
    }
  }catch(err){
    // ignore and fallback to local storage
  }

  // fallback: local storage with IndexedDB
  for(const f of files){
    try {
      // Store file in IndexedDB
      await storeFile(f);
      
      // Create a persistent URL using the stored file
      const url = URL.createObjectURL(f);
      const isVideo = isVideoFile(f.name);
      const entry = {
        title: f.name, 
        file: url, 
        url,
        type: isVideo ? 'video' : 'audio',
        localFile: true,
        filename: f.name // Store filename for retrieval
      };
      playlist.push(entry);
    } catch (error) {
      console.error('Failed to store file locally:', error);
      alert(`Failed to store ${f.name} locally`);
    }
  }
  
  // Save playlist to localStorage
  playlists[currentPlaylistName] = playlist;
  localStorage.setItem('playlists', JSON.stringify(playlists));
  
  renderPlaylist();
  // auto-play last uploaded
  playIndex(playlist.length-1);
});

// Download from URL
downloadBtn.addEventListener('click', async () => {
  const url = videoUrl.value.trim();
  const format = downloadFormat.value;
  
  if (!url) {
    downloadStatus.textContent = 'Please enter a video URL';
    downloadStatus.style.color = '#ef4444';
    return;
  }
  
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Downloading...';
  downloadStatus.textContent = `Downloading ${format.toUpperCase()}...`;
  downloadStatus.style.color = 'var(--muted)';
  
  try {
    const response = await fetch('/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, format }),
    });
    
    const result = await response.json();
    
    if (result.ok) {
      downloadStatus.textContent = result.message;
      downloadStatus.style.color = '#10b981';
      videoUrl.value = '';
      
      // Refresh playlist
      await loadSongsManifest();
      
      // Auto-play the newly downloaded file
      playIndex(playlist.length - 1);
    } else {
      downloadStatus.textContent = result.message;
      downloadStatus.style.color = '#ef4444';
    }
  } catch (error) {
    console.error('Download error:', error);
    downloadStatus.textContent = 'Download requires server connection. Start the server for YouTube downloads.';
    downloadStatus.style.color = '#ef4444';
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download';
  }
});

// IndexedDB setup for persistent file storage
let db;
const DB_NAME = 'SongPlayerDB';
const STORE_NAME = 'files';

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function storeFile(file) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(file, file.name);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getFile(filename) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(filename);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function deleteFile(filename) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(filename);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Init
let isOnline = true;

function checkServerStatus(){
  const indicator = document.getElementById('status-indicator');
  const warning = document.getElementById('offline-warning');
  fetch('songs.json').then(() => {
    isOnline = true;
    document.body.classList.remove('offline');
    if(indicator) indicator.textContent = '(Online)';
    if(warning) warning.style.display = 'none';
  }).catch(() => {
    isOnline = false;
    document.body.classList.add('offline');
    if(indicator) indicator.textContent = '(Offline)';
    if(warning) warning.style.display = 'block';
  });
}

async function initApp(){
  try {
    await initDB();
    console.log('IndexedDB initialized for persistent file storage');
  } catch (error) {
    console.warn('IndexedDB not available, files will not persist across page refreshes');
  }
  
  loadSongsManifest().then(() => {
    checkServerStatus();
    // If we have songs but no current selection, update UI
    if(playlist.length > 0 && current === -1){
      updateNowUI();
    }
  });
}

initApp();
