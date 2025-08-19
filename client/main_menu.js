
console.log('Main menu loaded');

window.onload = function() {
    const user = sessionStorage.getItem('user');
    if (!user) {
        console.log('No user found, redirecting to login');
        window.location.href = 'index.html';
        return;
    }
    
    const userData = JSON.parse(user);
    console.log('Welcome to main menu:', userData.username);

    const usernameElement = document.getElementById('username-display');
    if (usernameElement) {
        usernameElement.textContent = userData.username;
    }
    
    const logoMenu = document.getElementById('logo-menu');
    if (logoMenu) {
        logoMenu.classList.add('transition-animation');
        console.log('Logo transition animation triggered');
        
        setTimeout(() => {
            console.log('Starting menu buttons animation');
            const menuButtons = document.querySelectorAll('.menu-button');
            menuButtons.forEach(button => {
                button.classList.add('animate');
            });
        }, 2000);
    }
};

function logout() {
    sessionStorage.removeItem('user');
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', function() {
    const roomBtn = document.querySelector('.room-btn');
    const deckBtn = document.querySelector('.deck-btn');
    const profileViewerBtn = document.querySelector('.profile-viewer-btn');
    const myProfileBtn = document.querySelector('.my-profile-btn');
    const rankingsBtn = document.querySelector('.rankings-btn');
    const tournamentsBtn = document.querySelector('.tournaments-btn');
    const exitBtn = document.querySelector('.exit-btn');
    const settingsBtn = document.querySelector('.settings-btn');
    
    if (roomBtn) {
        roomBtn.onclick = function() {
            console.log('Duel Room clicked');
        };
    }
    
    if (deckBtn) {
        deckBtn.onclick = function() {
            console.log('Deck Constructor clicked');
        };
    }
    
    if (profileViewerBtn) {
        profileViewerBtn.onclick = function() {
            console.log('Profile Viewer clicked');
        };
    }
    
    if (myProfileBtn) {
        myProfileBtn.onclick = function() {
            console.log('My Profile clicked');
        };
    }
    
    if (rankingsBtn) {
        rankingsBtn.onclick = function() {
            console.log('Rankings clicked');
        };
    }
    
    if (tournamentsBtn) {
        tournamentsBtn.onclick = function() {
            console.log('Tournaments clicked');
        };
    }
    
    if (exitBtn) {
        exitBtn.onclick = function() {
            console.log('Exit clicked');
            logout();
        };
    }
    
    if (settingsBtn) {
        settingsBtn.onclick = function() {
            console.log('Settings clicked');
        };
    }
});
