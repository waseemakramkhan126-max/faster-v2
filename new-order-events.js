// ==========================================
// 5. EVENT LISTENERS
// ==========================================

function unlockAudio() {
    if(sound) {
        sound.muted = true;
        sound.play().then(() => {
            sound.pause(); 
            sound.currentTime = 0; 
            sound.muted = false;
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('click', unlockAudio);
        }).catch(e => console.warn(e));
    }
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

document.addEventListener('click', function(event) {
    const menu = document.getElementById('attachMenu');
    const plusBtn = document.getElementById('plusBtn');
    if (menu && menu.classList.contains('active')) {
        if (!menu.contains(event.target) && !plusBtn.contains(event.target)) {
            toggleAttachMenu(); 
        }
    }
});

// UI COLOR CONTROL: Internet band hone pe jo laal (red) patti aati hai wo CSS id #offlineBanner se control hoti hai
window.addEventListener('offline', () => {
    document.getElementById('offlineBanner').style.top = '0';
});

window.addEventListener('online', () => { 
    document.getElementById('offlineBanner').style.top = '-50px'; 
    initPage(); 
});
