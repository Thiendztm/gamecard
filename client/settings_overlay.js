// In-page Settings Overlay Logic (keeps BGM running)
document.addEventListener('DOMContentLoaded', function(){
  const STORAGE_KEY = 'gameSettings';
  const DEFAULTS = { bgmVolume:0.6, sfxVolume:0.8, mute:false };
  function load(){ try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY))||{}; return { bgmVolume: typeof s.bgmVolume==='number'?s.bgmVolume:DEFAULTS.bgmVolume, sfxVolume: typeof s.sfxVolume==='number'?s.sfxVolume:DEFAULTS.sfxVolume, mute: !!s.mute }; } catch { return {...DEFAULTS}; } }
  function save(settings){ localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); window.dispatchEvent(new CustomEvent('settings:changed',{detail:settings})); }
  function fmtPct(v){ return Math.round(v*100)+'%'; }
  function open(){ modal.style.display='flex'; refreshUI(); }
  function close(){ 
    modal.style.display='none'; 
    if(window.sfxManager) { 
      window.sfxManager.playCancel(); 
    } 
  }

  const modal = document.getElementById('settings-overlay-modal');
  if(!modal) return; // not on this page
  const bgmRange = document.getElementById('overlay-bgm-range');
  const sfxRange = document.getElementById('overlay-sfx-range');
  const bgmVal = document.getElementById('overlay-bgm-value');
  const sfxVal = document.getElementById('overlay-sfx-value');
  const btnSave = document.getElementById('overlay-save-btn');
  const btnDefault = document.getElementById('overlay-default-btn');
  // const btnClose = document.getElementById('settings-close-btn'); // Removed close button
  const dismiss = document.getElementById('settings-overlay-dismiss');
  let current = load();

  function refreshUI(){ 
    current = load(); 
    bgmRange.value = Math.round(current.bgmVolume*100); 
    sfxRange.value = Math.round(current.sfxVolume*100); 
    bgmVal.textContent = fmtPct(current.bgmVolume); 
    sfxVal.textContent = fmtPct(current.sfxVolume); 
    
    // Apply volumes to actual systems
    if(window.musicPlayer) {
      window.musicPlayer.setVolume(current.bgmVolume);
    }
    if(window.sfxManager) {
      window.sfxManager.setVolume(current.sfxVolume);
    }
  }

  bgmRange.addEventListener('input', ()=>{ 
    bgmVal.textContent = bgmRange.value+'%'; 
    if(window.musicPlayer) { 
      window.musicPlayer.setVolume(bgmRange.value/100); 
    } 
  });
  sfxRange.addEventListener('input', ()=>{ 
    sfxVal.textContent = sfxRange.value+'%'; 
    if(window.sfxManager) { 
      window.sfxManager.setVolume(sfxRange.value/100); 
    } 
  });

  btnSave.addEventListener('click', ()=>{ current.bgmVolume = bgmRange.value/100; current.sfxVolume = sfxRange.value/100; save(current); btnSave.textContent='Đã lưu'; setTimeout(()=>btnSave.textContent='Lưu',900); });
  btnDefault.addEventListener('click', ()=>{ current = {...DEFAULTS}; save(current); refreshUI(); });
  dismiss.addEventListener('click', close);

  // Expose open function for main_menu.js to call (avoid global clutter)
  window.__openSettingsOverlay = open;
});