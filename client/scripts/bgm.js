// bgm.js - BGM Manager for Touhou FM: Card Battle
// Public API (attached to window.BGM):
// init(): prepare audio context & load settings (no autoplay until user gesture)
// play(index=0,{fadeInMs=600}): play track loop with fade in
// pause({fadeOutMs=300}) / resume(): pause & resume preserving position
// stop({fadeOutMs=400}): stop & reset position
// next()/prev(): switch track with crossfade (300-600ms)
// setVolume(v): set base volume 0..1 and persist to localStorage
// setMute(m): soft mute (does not overwrite stored base volume)
// duck(amount=0.2) / unduck(): temporary volume reduction for jingles
// Properties: currentIndex, isPlaying (getters)
// Reacts to: window.dispatchEvent(new CustomEvent('settings:changed',{detail:settings}))

(function(){
  // Dùng đường dẫn tương đối để không phụ thuộc vào việc host ở root (/)
  // Nếu cần có base path động, có thể gán window.__ASSET_BASE__ trước khi load file này.
  const TRACKS = [
    (window.__ASSET_BASE__||'') + './audio/bgm1.mp3',
    (window.__ASSET_BASE__||'') + './audio/bgm2.mp3',
    (window.__ASSET_BASE__||'') + './audio/bgm3.mp3',
    (window.__ASSET_BASE__||'') + './audio/bgm4.mp3',
    (window.__ASSET_BASE__||'') + './audio/bgm5.mp3'
  ];
  const STORAGE_KEY = 'gameSettings';
  const AUTOPLAY_GESTURES = ['pointerdown','keydown'];
  const PAGE_VISIBILITY_ATTENUATION = 0.5; // reduce volume when tab hidden
  // Default crossfade (used if dynamic range not applied)
  const CROSSFADE_MS_DEFAULT = 500;
  // Dynamic crossfade range (ms). Used for next/prev & switching play between different tracks.
  let crossfadeRangeMs = [500, 1000];

  let audioCtx = null; // AudioContext
  let gainNode = null; // main gain
  let duckGainNode = null; // ducking layer
  let hiddenFactor = 1; // 0.5 when page hidden
  let baseVolume = 0.6; // from settings
  // BGM mute trạng thái riêng (không ảnh hưởng SFX)
  let muted = false; // đại diện cho BGM muted
  let duckAmount = 1; // <1 when duck()
  let userGestureReceived = false;
  let pendingPlayRequest = null; // {index, opts}
  let currentIndex = 0;
  let isPlaying = false;
  let currentSource = null; // current AudioBufferSourceNode
  let currentBuffer = null;
  let startTime = 0; // context.currentTime when started
  let pauseOffset = 0; // seconds offset when paused
  // Shuffle (random) playback support
  let shuffleEnabled = false; // chỉ bật trong trận (gamePlay) – menu mặc định tắt
  let unplayedPool = []; // danh sách index chưa phát trong vòng hiện tại
  // Auto advance scheduling
  let autoAdvanceTimer = null;
  const AUTO_NEXT_MIN_LEAD_MS = 600; // ms tối thiểu overlap trước khi hết bài

  const buffers = new Array(TRACKS.length).fill(null); // decoded AudioBuffers

  function log(...a){ /* console.debug('[BGM]',...a); */ }

  function loadSettings(){
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY))||{};
      baseVolume = typeof s.bgmVolume==='number'? s.bgmVolume : 0.6;
      // Ưu tiên bgmMuted mới, fallback sang mute cũ để tương thích
      muted = typeof s.bgmMuted === 'boolean' ? s.bgmMuted : !!s.mute;
    } catch { baseVolume = 0.6; muted=false; }
  }

  function saveSettings(){
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY))||{};
      s.bgmVolume = baseVolume;
      s.bgmMuted = muted; // không ghi đè s.mute cũ để tránh ảnh hưởng logic SFX cũ
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {}
  }

  // Ensure AudioContext created only after user gesture (for autoplay policy)
  function ensureContext(){
    if (!audioCtx){
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      duckGainNode = audioCtx.createGain();
      duckGainNode.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      applyVolumeImmediate();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  async function preloadBuffer(i){
    console.log('🎵 preloadBuffer called for index:', i, 'URL:', TRACKS[i]);
    if (buffers[i]) {
      console.log('🎵 Buffer already cached for index:', i);
      return buffers[i];
    }
    const url = TRACKS[i];
    try {
      console.log('🎵 Fetching audio file:', url);
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }
      console.log('🎵 Fetch successful, converting to ArrayBuffer');
      const arr = await resp.arrayBuffer();
      console.log('🎵 ArrayBuffer size:', arr.byteLength, 'bytes');
      console.log('🎵 Decoding audio data...');
      const buf = await audioCtx.decodeAudioData(arr);
      console.log('🎵 Audio decoded successfully, duration:', buf.duration, 'seconds');
      buffers[i] = buf; 
      return buf;
    } catch (error) {
      console.error('🎵 Failed to preload buffer for index:', i, 'Error:', error);
      throw error;
    }
  }

  function applyVolumeImmediate(){
    if (!gainNode) return;
    const target = (muted?0:baseVolume) * duckAmount * hiddenFactor;
    gainNode.gain.setValueAtTime(target, audioCtx.currentTime);
  }

  function applyVolumeSmooth(ms=150){
    if (!gainNode) return;
    const target = (muted?0:baseVolume) * duckAmount * hiddenFactor;
    const t = audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.linearRampToValueAtTime(target, t + ms/1000);
  }

  function scheduleGestureResolution(){
    if (userGestureReceived) {
      console.log('🎵 User gesture already received');
      return;
    }
    console.log('🎵 Setting up gesture listeners for BGM unlock');
    function onFirstGesture(event){
      console.log('🎵 First user gesture detected:', event.type);
      userGestureReceived = true;
      AUTOPLAY_GESTURES.forEach(ev=>window.removeEventListener(ev,onFirstGesture));
      if (pendingPlayRequest){
        console.log('🎵 Executing pending play request:', pendingPlayRequest);
        const {index, opts} = pendingPlayRequest; pendingPlayRequest=null;
        BGM.play(index, opts);
      }
    }
    AUTOPLAY_GESTURES.forEach(ev=>window.addEventListener(ev,onFirstGesture,{once:true}));
  }

  function createSource(buffer, offset=0){
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = false; // không loop, tự advance
    src.connect(duckGainNode);
    src.start(0, offset % buffer.duration);
    src.onended = ()=>{
      if(!isPlaying) return;
      if(currentSource !== src) return;
      try { BGM.next(); } catch(e){}
    };
    return src;
  }

  async function startTrack(index, {fadeInMs=600, offset=0, crossfadeMs=0}={}){
    console.log('🎵 startTrack called:', {index, fadeInMs, offset, crossfadeMs});
    ensureContext();
    console.log('🎵 AudioContext state:', audioCtx?.state);
    currentIndex = (index+TRACKS.length)%TRACKS.length;
    if (isPlaying && currentSource && currentBuffer && currentIndex === index && Math.abs(offset - ((audioCtx.currentTime - startTime) % currentBuffer.duration)) < 0.05 && crossfadeMs===0) {
      console.log('🎵 Track already playing, skipping');
      return;
    }
    console.log('🎵 Loading buffer for track:', currentIndex, TRACKS[currentIndex]);
    const buffer = await preloadBuffer(currentIndex);
    if (!buffer) {
      console.error('🎵 Failed to load buffer for track:', currentIndex);
      return;
    }
    console.log('🎵 Buffer loaded, creating source');
    const newSource = createSource(buffer, offset);
    const oldSource = currentSource;
    currentSource = newSource;
    currentBuffer = buffer;
    startTime = audioCtx.currentTime - offset;
    isPlaying = true;
    if (oldSource && crossfadeMs>0){
      const gOld = audioCtx.createGain();
      const gNew = audioCtx.createGain();
      // Re-route
      newSource.disconnect();
      oldSource.disconnect();
      newSource.connect(gNew).connect(duckGainNode);
      oldSource.connect(gOld).connect(duckGainNode);
      gNew.gain.setValueAtTime(0, audioCtx.currentTime);
      gNew.gain.linearRampToValueAtTime(1, audioCtx.currentTime + crossfadeMs/1000);
      gOld.gain.setValueAtTime(1, audioCtx.currentTime);
      gOld.gain.linearRampToValueAtTime(0, audioCtx.currentTime + crossfadeMs/1000);
      setTimeout(()=>{ try{ oldSource.onended=null; oldSource.stop(); }catch{} }, crossfadeMs+50);
  } else if (fadeInMs>0){
      duckGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      duckGainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + fadeInMs/1000);
    } else {
      duckGainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    }
  // Ensure old source stops if we did not crossfade
  if (oldSource && crossfadeMs===0){ try { oldSource.onended=null; oldSource.stop(); } catch {}
  }
    applyVolumeImmediate();
    window.dispatchEvent(new CustomEvent('bgm:trackchange',{detail:{index: currentIndex, url: TRACKS[currentIndex]}}));
    // Schedule early auto-advance (gapless)
    if(autoAdvanceTimer){ clearTimeout(autoAdvanceTimer); autoAdvanceTimer=null; }
    if(currentBuffer){
      const durMs = currentBuffer.duration*1000;
      const predictiveXfade = pickCrossfadeMs();
      const lead = Math.max(AUTO_NEXT_MIN_LEAD_MS, predictiveXfade);
      const fireIn = durMs - lead;
      if(fireIn > 500){
        autoAdvanceTimer = setTimeout(()=>{
          if(!isPlaying || currentSource !== newSource) return;
          if(newSource && newSource.onended) newSource.onended=null; // tránh double
          BGM.next();
        }, fireIn);
      }
    }
  }

  function fadeOutAnd(action, ms){
    if (!audioCtx || !currentSource) { action(); return; }
    duckGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    duckGainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + ms/1000);
    setTimeout(()=>action(), ms+30);
  }

  const BGM = {
    async init(){
      console.log('🎵 BGM.init() called');
      loadSettings();
      console.log('🎵 BGM settings loaded:', {baseVolume, muted, userGestureReceived});
      scheduleGestureResolution();
      if(userGestureReceived){ 
        console.log('🎵 User gesture detected, preloading tracks...');
        TRACKS.forEach((_,i)=>preloadBuffer(i).catch((e)=>{
          console.warn(`🎵 Failed to preload track ${i}:`, e);
        })); 
      } else {
        console.log('🎵 No user gesture yet, waiting...');
      }
      return true;
    },
    async play(index=0, opts={}){
      console.log('🎵 BGM.play() called with:', {index, opts, userGestureReceived});
      loadSettings();
      if (!userGestureReceived){
        console.log('🎵 No user gesture, pending play request');
        pendingPlayRequest = {index, opts};
        scheduleGestureResolution();
        return;
      }
      // If switching to a different track and no explicit crossfade given, apply dynamic crossfade
      if (isPlaying && index !== currentIndex && typeof opts.crossfadeMs === 'undefined'){
        opts = {...opts, crossfadeMs: pickCrossfadeMs()};
      }
      console.log('🎵 Starting track:', index);
      await startTrack(index, opts);
    },
  async playRandom(opts={}){
      console.log('🎵 BGM.playRandom() called with:', opts);
      // Chọn ngẫu nhiên track khác hiện tại (nếu có >1 track)
      if(TRACKS.length===0) {
        console.warn('🎵 No tracks available');
        return;
      }
      if(unplayedPool.length===0){
        // refill pool trừ current
        unplayedPool = TRACKS.map((_,i)=>i).filter(i=>i!==currentIndex);
        if(unplayedPool.length===0) unplayedPool = TRACKS.map((_,i)=>i); // chỉ 1 bài
        console.log('🎵 Refilled unplayed pool:', unplayedPool);
      }
      const pickIdx = Math.floor(Math.random()*unplayedPool.length);
      const nextIndex = unplayedPool.splice(pickIdx,1)[0];
      console.log('🎵 Selected random track:', nextIndex, 'from pool:', unplayedPool);
      await this.play(nextIndex, opts);
    },
  pause({fadeOutMs=300}={}){ if(!isPlaying) return; fadeOutAnd(()=>{ if(currentSource){ try{ currentSource.onended=null; currentSource.stop(); }catch{} } if(autoAdvanceTimer){clearTimeout(autoAdvanceTimer);autoAdvanceTimer=null;} pauseOffset = audioCtx.currentTime - startTime; isPlaying=false; }, fadeOutMs); },
  resume(){ if(isPlaying||!currentBuffer) return; ensureContext(); startTrack(currentIndex,{offset:pauseOffset,fadeInMs:400}); },
  stop({fadeOutMs=400}={}){ if(!isPlaying) return; fadeOutAnd(()=>{ if(currentSource){ try{ currentSource.onended=null; currentSource.stop(); }catch{} } if(autoAdvanceTimer){clearTimeout(autoAdvanceTimer);autoAdvanceTimer=null;} isPlaying=false; pauseOffset=0; }, fadeOutMs); },
  next(){ if(!userGestureReceived) return; if(shuffleEnabled){ this.playRandom({crossfadeMs:pickCrossfadeMs()}); return; } const ni=(currentIndex+1)%TRACKS.length; startTrack(ni,{crossfadeMs:pickCrossfadeMs()}); },
  prev(){ if(!userGestureReceived) return; if(shuffleEnabled){ this.playRandom({crossfadeMs:pickCrossfadeMs()}); return; } const ni=(currentIndex-1+TRACKS.length)%TRACKS.length; startTrack(ni,{crossfadeMs:pickCrossfadeMs()}); },
    setVolume(v){ baseVolume = Math.max(0,Math.min(1,v)); saveSettings(); if(audioCtx) applyVolumeSmooth(150); },
  setMute(m){ muted=!!m; saveSettings(); if(audioCtx) applyVolumeSmooth(150); },
    duck(amount=0.2){ duckAmount = Math.max(0, Math.min(1, amount)); if(audioCtx) applyVolumeSmooth(100); },
    unduck(){ duckAmount = 1; if(audioCtx) applyVolumeSmooth(100); },
  seek(sec){ if(!audioCtx || !currentBuffer) return; sec = Math.max(0, Math.min(currentBuffer.duration-0.05, sec)); const wasPlaying = isPlaying; if (currentSource){ try{ currentSource.stop(); }catch{} } isPlaying=false; startTrack(currentIndex,{offset:sec,fadeInMs:150}); if(!wasPlaying){ this.pause({fadeOutMs:0}); } },
    setShuffle(on){ shuffleEnabled = !!on; if(on){ unplayedPool=[]; } },
    toggleShuffle(){ this.setShuffle(!shuffleEnabled); },
    get isShuffle(){ return shuffleEnabled; },
    getPosition(){
      if (!audioCtx || !currentBuffer) return 0;
      if (!isPlaying) return Math.min(pauseOffset % currentBuffer.duration, currentBuffer.duration);
      return (audioCtx.currentTime - startTime) % currentBuffer.duration;
    },
    getDuration(){ return currentBuffer? currentBuffer.duration : 0; },
    get currentIndex(){ return currentIndex; },
  get isPlaying(){ return isPlaying; },
  get isMuted(){ return muted; },
  
  // Manually trigger gesture for integration with other audio systems
  triggerGesture(){
    if (!userGestureReceived) {
      console.log('🎵 BGM gesture triggered manually');
      userGestureReceived = true;
      // Remove existing listeners since we're manually triggered
      AUTOPLAY_GESTURES.forEach(ev=>window.removeEventListener(ev,()=>{}));
      if (pendingPlayRequest){
        console.log('🎵 Executing pending BGM play request:', pendingPlayRequest);
        const {index, opts} = pendingPlayRequest; 
        pendingPlayRequest=null;
        this.play(index, opts);
      }
    }
  }
  };

  function pickCrossfadeMs(){
    const [min,max] = crossfadeRangeMs;
    const hi = Math.max(min,max); const lo = Math.min(min,max);
    return Math.round(lo + Math.random()*(hi-lo));
  }

  // Public API to adjust crossfade range (seconds if <=5 else treat as ms)
  BGM.setCrossfadeRange = function(minVal, maxVal){
    if (typeof minVal !== 'number' || typeof maxVal !== 'number') return;
    const toMs = v => (v <= 5 ? v*1000 : v); // heuristic
    crossfadeRangeMs = [toMs(minVal), toMs(maxVal)];
  };

  // React to settings changes broadcast
  window.addEventListener('settings:changed', e=>{
    const s = e.detail || {};
    if (typeof s.bgmVolume==='number') baseVolume = s.bgmVolume;
    if (typeof s.mute==='boolean') muted = s.mute;
    if (audioCtx) applyVolumeSmooth(150);
  });

  // Page visibility handling (simple attenuation)
  document.addEventListener('visibilitychange', ()=>{
    hiddenFactor = document.hidden ? PAGE_VISIBILITY_ATTENUATION : 1;
    if (audioCtx) applyVolumeSmooth(200);
  });

  window.BGM = BGM; // expose
})();
