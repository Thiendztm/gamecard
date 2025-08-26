const DEFAULT_SETTINGS = {
    bgmVolume: 0.6,
    sfxVolume: 0.8
};

const STORAGE_KEY = "gameSettings";

function loadSettings() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            const settings = JSON.parse(data);
            return {
                bgmVolume: typeof settings.bgmVolume === 'number' ? settings.bgmVolume : DEFAULT_SETTINGS.bgmVolume,
                sfxVolume: typeof settings.sfxVolume === 'number' ? settings.sfxVolume : DEFAULT_SETTINGS.sfxVolume
            };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Broadcast thay đổi cho các hệ thống (BGM, SFX...)
    window.dispatchEvent(new CustomEvent('settings:changed', { detail: settings }));
}

function updateUI(settings) {
    const bgmSlider = document.getElementById('bgm-volume');
    const sfxSlider = document.getElementById('sfx-volume');
    const bgmValue = document.getElementById('bgm-value');
    const sfxValue = document.getElementById('sfx-value');
    bgmSlider.value = Math.round(settings.bgmVolume * 100);
    sfxSlider.value = Math.round(settings.sfxVolume * 100);
    bgmValue.textContent = `${bgmSlider.value}%`;
    sfxValue.textContent = `${sfxSlider.value}%`;
}

document.addEventListener('DOMContentLoaded', () => {
    const bgmSlider = document.getElementById('bgm-volume');
    const sfxSlider = document.getElementById('sfx-volume');
    const bgmValue = document.getElementById('bgm-value');
    const sfxValue = document.getElementById('sfx-value');
    const saveBtn = document.getElementById('save-btn');
    const defaultBtn = document.getElementById('default-btn');
    const exitBtn = document.getElementById('exit-btn');

    let settings = loadSettings();
    updateUI(settings);

    bgmSlider.addEventListener('input', () => {
        bgmValue.textContent = `${bgmSlider.value}%`;
    if (window.BGM) { BGM.setVolume(bgmSlider.value / 100); }
    });
    sfxSlider.addEventListener('input', () => {
        sfxValue.textContent = `${sfxSlider.value}%`;
    });

    saveBtn.addEventListener('click', () => {
        settings.bgmVolume = bgmSlider.value / 100;
        settings.sfxVolume = sfxSlider.value / 100;
        saveSettings(settings);
        saveBtn.textContent = 'Saved!';
        setTimeout(() => saveBtn.textContent = 'Save', 1000);
    });

    defaultBtn.addEventListener('click', () => {
        settings = { ...DEFAULT_SETTINGS };
        updateUI(settings);
    });

    exitBtn.addEventListener('click', () => {
        window.location.href = 'main_menu.html';
    });

    // Reload UI if page is reloaded
    window.addEventListener('pageshow', () => {
        settings = loadSettings();
        updateUI(settings);
    });
});
