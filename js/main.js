/* ── Navbar scroll ── */
const nav = document.getElementById('navbar');

// ── Tab System ─────────────────────────────────────
const ALL_TABS = ['home', 'home-cta', 'about', 'features', 'commands', 'stats', 'games'];
const HOME_TABS = ['home'];

function showTab(targetId) {
    // Update body class for tab-specific styling
    document.body.className = targetId + '-tab-active';
    
    // Hide every tab section
    ALL_TABS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const footer = document.getElementById('site-footer');

    if (targetId === 'home') {
        // Show hero + cta together
        HOME_TABS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('active');
        });
        // Show footer on home
        if (footer) footer.style.display = '';
        // Clear active nav link highlight
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    } else if (targetId === 'stats') {
        // Stats tab: show stats strip + CTA box
        const statsEl = document.getElementById('stats');
        const ctaEl = document.getElementById('home-cta');
        if (statsEl) statsEl.classList.add('active');
        if (ctaEl) ctaEl.classList.add('active');
        if (footer) footer.style.display = 'none';
    } else {
        // Show only the clicked tab
        const el = document.getElementById(targetId);
        if (el) el.classList.add('active');
        // Hide footer on sub-pages
        if (footer) footer.style.display = 'none';
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Nav link clicks
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return;
        e.preventDefault();
        const targetId = href.substring(1);
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        showTab(targetId);
    });
});

// Logo click = go home
const navLogo = document.querySelector('.nav-logo');
if (navLogo) {
    navLogo.addEventListener('click', (e) => {
        e.preventDefault();
        showTab('home');
    });
}

// Add scrolled class to nav
window.addEventListener('scroll', () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── Reveal on scroll ── */
const observer = new IntersectionObserver((entries) => {
    let delay = 0;
    entries.forEach(e => { 
        if (e.isIntersecting) { 
            setTimeout(() => e.target.classList.add('visible'), delay);
            delay += 100;
            observer.unobserve(e.target);
        } 
    });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal, .io-reveal').forEach(el => observer.observe(el));

/* ── Count-up animation ── */
function countUp(el) {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    if (isNaN(target)) return;
    const isFloat = target % 1 !== 0;
    const duration = 1200;
    const start = performance.now();
    function step(now) {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const val = target * ease;
        el.textContent = (isFloat ? val.toFixed(2) : Math.floor(val)) + suffix;
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
}
const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { 
        if (e.isIntersecting) { 
            countUp(e.target); 
            statObserver.unobserve(e.target); 
        } 
    });
}, { threshold: 0.4 });
document.querySelectorAll('.stat-number').forEach(el => statObserver.observe(el));

/* ── Command filters ── */
const filterBtns = document.querySelectorAll('.cmd-filter');
const categories = document.querySelectorAll('.cmd-category');

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        categories.forEach(cat => {
            if (filter === 'all' || cat.dataset.cat === filter) {
                cat.style.display = 'block';
                setTimeout(() => cat.style.opacity = '1', 10);
            } else {
                cat.style.opacity = '0';
                setTimeout(() => cat.style.display = 'none', 250);
            }
        });
    });
});

// ── 4. FETCH LIVE STATS & GAMES ───────────────────────────────────
async function fetchPublicStats() {
    try {
        const r = await fetch('/api/bot_data?t=' + Date.now());
        if (!r.ok) return;
        
        const d = await r.json();
        const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;
        
        const displayServers = 1;
        const displayUsers = d.total_users || 0;
        
        const hs = document.getElementById('hero-servers');
        const hm = document.getElementById('hero-members');
        const hp = document.getElementById('hero-ping');
        
        if (hs) hs.textContent = fmt(displayServers);
        if (hm) hm.textContent = fmt(displayUsers);
        if (d.uptime_seconds !== undefined) {
            window.heroUptimeSec = d.uptime_seconds;
        } else {
            const hu = document.getElementById('hero-uptime');
            if (hu) hu.textContent = d.uptime || '--';
        }
        if (hp) hp.textContent = (d.ping || '--') + ' ms';
        
        const aServ = document.getElementById('about-servers');
        const aUsers = document.getElementById('about-users');
        const aPing = document.getElementById('about-ping');
        if (aServ) aServ.textContent = fmt(displayServers);
        if (aUsers) aUsers.textContent = fmt(displayUsers);
        if (aPing) aPing.textContent = (d.ping || '--') + 'ms';
        
        const sc = document.getElementById('server-count-stat');
        const uc = document.getElementById('user-count-stat');
        const cc = document.getElementById('cmd-count-stat');
        if (sc) { sc.dataset.target = displayServers; sc.textContent = displayServers; }
        if (uc) { uc.dataset.target = displayUsers; uc.textContent = displayUsers; }
        if (cc && d.total_commands !== undefined) { cc.dataset.target = d.total_commands; cc.textContent = d.total_commands; }
        
        const serverLabelEl = document.getElementById('hero-servers-label');
        if (serverLabelEl) {
            serverLabelEl.textContent = displayServers === 1 ? 'SERVER' : 'SERVERS';
        }
        
        if (typeof activities !== 'undefined') {
            activities[1] = `${fmt(displayServers)} ${displayServers === 1 ? 'SERVER' : 'SERVERS'}`;
        }
        
        if (d.top_played_games && Array.isArray(d.top_played_games)) {
            renderLiveGames(d.top_played_games);
        }
    } catch(e) {}
}

const GAME_IMAGE_OVERRIDES = {
    "Forza Horizon 5": "https://steamcdn-a.akamaihd.net/steam/apps/1551360/library_600x900_2x.jpg",
    "EA Sports FC 24": "https://steamcdn-a.akamaihd.net/steam/apps/2195250/library_600x900_2x.jpg",
    "EA SPORTS FC™ 24": "https://steamcdn-a.akamaihd.net/steam/apps/2195250/library_600x900_2x.jpg",
    "Wuthering Waves": "https://cdn1.epicgames.com/offer/7521798363714856aee6dfa3ff4d284a/EGS_WutheringWaves_KuroGames_S2_1200x1600-bdfcb7d5d2cc8a0a9ed6d35dcfe6b31c?h=480&quality=medium&resize=1&w=360",
    "League of Legends": "https://static-cdn.jtvnw.net/ttv-boxart/21779-285x380.jpg",
    "PUBG: BATTLEGROUNDS": "https://steamcdn-a.akamaihd.net/steam/apps/578080/library_600x900_2x.jpg",
    "Grand Theft Auto V": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "Counter-Strike 2": "https://steamcdn-a.akamaihd.net/steam/apps/730/library_600x900_2x.jpg",
    "Red Dead Redemption 2": "https://steamcdn-a.akamaihd.net/steam/apps/1174180/library_600x900_2x.jpg"
};

function getGameImageUrl(gameName) {
    if (GAME_IMAGE_OVERRIDES[gameName]) {
        return GAME_IMAGE_OVERRIDES[gameName];
    }
    return `https://static-cdn.jtvnw.net/ttv-boxart/${encodeURIComponent(gameName)}-285x380.jpg`;
}

function renderLiveGames(gamesList) {
    const grid = document.getElementById('live-games-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    gamesList.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <img src="${getGameImageUrl(game.name)}" alt="${game.name}" onerror="this.src='https://static-cdn.jtvnw.net/ttv-boxart/499973-285x380.jpg';">
            <div class="game-name">${game.name} <span style="font-size: 0.8rem; opacity: 0.7; margin-left: 5px;">(${game.count})</span></div>
        `;
        grid.appendChild(card);
    });
}

fetchPublicStats();
setInterval(fetchPublicStats, 15000);

// ── Real-time Uptime Counter ──
window.heroUptimeSec = 0;
setInterval(() => {
    if (window.heroUptimeSec > 0) {
        window.heroUptimeSec++;
        const d = Math.floor(window.heroUptimeSec / 86400);
        const h = Math.floor((window.heroUptimeSec % 86400) / 3600);
        const m = Math.floor((window.heroUptimeSec % 3600) / 60);
        let timeStr = '';
        if (d > 0) timeStr += `${d}d `;
        if (h > 0 || d > 0) timeStr += `${h}h `;
        if (m > 0 || h > 0 || d > 0) timeStr += `${m}m`;
        if (timeStr === '') timeStr = '< 1m';
        const uptimeEl = document.getElementById('hero-uptime');
        if (uptimeEl) uptimeEl.textContent = timeStr.trim();
    }
}, 1000);

// ── Real-time Discord Presence Update ──
const activities = ["Watching Ninja Nexus", "75+ COMMANDS", "99.99% UPTIME"];
let activityIdx = 0;
const dpTexts = document.querySelectorAll('.dp-dynamic-text');

if (dpTexts.length > 0) {
    setInterval(() => {
        activityIdx = (activityIdx + 1) % activities.length;
        dpTexts.forEach(el => el.style.opacity = '0');
        setTimeout(() => {
            dpTexts.forEach(el => {
                el.textContent = activities[activityIdx];
                el.style.opacity = '1';
            });
        }, 300);
    }, 3500);
}

// ── Background Music & Smooth Audio Sync Visualizer ──
const musicToggle = document.getElementById('music-toggle');
const bgMusic = document.getElementById('bg-music');
const musicIcon = document.getElementById('music-icon');
const heroBgImg = document.querySelector('.hero-img-bg');

let audioCtx;
let analyser;
let dataArray;
let source;
let isVisualizerRunning = false;
let smoothedBass = 0;
let lastFrameTime = 0;

function initAudio() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    source = audioCtx.createMediaElementSource(bgMusic);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.fftSize = 128; // Highly optimized FFT size
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function animateVisualizer(now) {
    if (!isVisualizerRunning) return;
    requestAnimationFrame(animateVisualizer);

    // Throttle frame loop for buttery performance
    if (now - lastFrameTime < 16) return;
    lastFrameTime = now;
    
    analyser.getByteFrequencyData(dataArray);
    
    // Average bass frequencies (first 6 bins)
    let bassSum = 0;
    for(let i = 0; i < 6; i++) {
        bassSum += dataArray[i];
    }
    const bassAvg = bassSum / 6;
    
    // Exponential smoothing (prevents CPU stutter)
    smoothedBass += (bassAvg - smoothedBass) * 0.2;
    
    const scale = 1.0 + (smoothedBass / 255) * 0.04;
    const opacity = 0.65 + (smoothedBass / 255) * 0.15;

    if (heroBgImg) {
        heroBgImg.style.transform = `translate3d(0,0,0) scale(${scale.toFixed(3)})`;
        heroBgImg.style.opacity = opacity.toFixed(2);
    }
}

if (musicToggle && bgMusic) {
    bgMusic.volume = 0.3;

    const togglePlay = () => {
        if (bgMusic.paused) {
            initAudio();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            bgMusic.play().then(() => {
                if (musicIcon) {
                    musicIcon.classList.remove('fa-volume-mute');
                    musicIcon.classList.add('fa-music');
                }
                musicToggle.classList.add('playing');
                isVisualizerRunning = true;
                requestAnimationFrame(animateVisualizer);
            }).catch(err => {
                console.error('Audio playback failed:', err);
            });
        } else {
            bgMusic.pause();
            if (musicIcon) {
                musicIcon.classList.remove('fa-music');
                musicIcon.classList.add('fa-volume-mute');
            }
            musicToggle.classList.remove('playing');
            isVisualizerRunning = false;
            
            if (heroBgImg) {
                heroBgImg.style.transform = 'translate3d(0,0,0) scale(1.0)';
                heroBgImg.style.opacity = '0.75';
            }
        }
    };

    musicToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // Auto-play attempt
    setTimeout(() => {
        if (bgMusic.paused) {
            togglePlay();
        }
    }, 500);

    // Fallback: Start music on user's first click anywhere on the page
    const startOnInteraction = () => {
        if (bgMusic.paused) {
            togglePlay();
        }
        document.removeEventListener('click', startOnInteraction);
    };
    document.addEventListener('click', startOnInteraction);
}
