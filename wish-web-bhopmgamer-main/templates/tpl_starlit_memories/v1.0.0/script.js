/**
 * Starlit Memories Template Script
 * Handles star generation, animations, and countdown logic.
 */

document.addEventListener('DOMContentLoaded', () => {
    initStars();
    initIntersectionObserver();
    initCountdown();
});

/**
 * Generates dynamic twinkling stars in the background.
 */
function initStars() {
    const container = document.getElementById('stars-container');
    if (!container) return;

    const count = window.innerWidth < 768 ? 50 : 150;
    
    for (let i = 0; i < count; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        
        const size = Math.random() * 3 + 1;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const duration = Math.random() * 3 + 2;
        const delay = Math.random() * 5;

        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.setProperty('--duration', `${duration}s`);
        star.style.animationDelay = `${delay}s`;
        
        container.appendChild(star);
    }
}

/**
 * Handles smooth reveals of sections on scroll.
 */
function initIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });
}

/**
 * Countdown timer logic.
 * Looks for a date in the countdown element or global data.
 */
function initCountdown() {
    const countdownEl = document.getElementById('celebration-countdown');
    if (!countdownEl) return;

    // In a real WishMagic environment, this date is injected by the platform.
    // We look for it in common locations or use a fallback.
    let targetDateStr = countdownEl.getAttribute('data-date');
    
    // If not found, try to find from manifest binding or a mock
    if (!targetDateStr) {
        const urlParams = new URLSearchParams(window.location.search);
        targetDateStr = urlParams.get('event_date') || new Date(Date.now() + 86400000).toISOString();
    }

    const targetDate = new Date(targetDateStr).getTime();

    const update = () => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            countdownEl.innerHTML = '<span class="text-[#FCD34D] text-2xl font-bold uppercase tracking-widest animate-pulse">It\'s Celebration Time! ✨</span>';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const dEl = countdownEl.querySelector('.days');
        const hEl = countdownEl.querySelector('.hours');
        const mEl = countdownEl.querySelector('.minutes');
        const sEl = countdownEl.querySelector('.seconds');

        if (dEl) dEl.textContent = days.toString().padStart(2, '0');
        if (hEl) hEl.textContent = hours.toString().padStart(2, '0');
        if (mEl) mEl.textContent = minutes.toString().padStart(2, '0');
        if (sEl) sEl.textContent = seconds.toString().padStart(2, '0');
    };

    update();
    setInterval(update, 1000);
}

/**
 * Universal Template Protocol (UTP) Data Binding Hook
 * This is how the platform runtime can push data into the template.
 * If the platform provides a global 'window.wishData', we use it.
 */
window.addEventListener('message', (event) => {
    // Example: Listening for live updates from the customizer preview
    if (event.data && event.data.type === 'WISH_DATA_UPDATE') {
        const data = event.data.payload;
        applyWishData(data);
    }
});

function applyWishData(data) {
    if (!data) return;
    
    // Recipient Name
    if (data.recipient_name) {
        document.getElementById('recipient-name').textContent = data.recipient_name;
    }
    
    // Sender Name
    if (data.sender_name) {
        document.getElementById('sender-name').textContent = data.sender_name;
    }
    
    // Message
    if (data.main_message) {
        document.getElementById('main-message').textContent = data.main_message;
    }
    
    // Cover Photo
    if (data.cover_photo) {
        document.getElementById('hero-backdrop').style.backgroundImage = `url(${data.cover_photo})`;
    }
    
    // Gallery
    if (data.memories && Array.isArray(data.memories)) {
        const grid = document.getElementById('memory-grid');
        grid.innerHTML = '';
        data.memories.forEach(url => {
            const card = document.createElement('div');
            card.className = 'memory-card group';
            card.innerHTML = `
                <img src="${url}" alt="Memory" loading="lazy">
                <div class="memory-overlay">
                    <span class="text-white/80 text-xs font-semibold uppercase tracking-wider">A Golden Moment</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }
    
    // Star Color (CSS Variable)
    if (data.star_color) {
        document.documentElement.style.setProperty('--star-glow', data.star_color);
    }
}
