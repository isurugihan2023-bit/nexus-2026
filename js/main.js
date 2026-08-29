/* ── Navbar scroll ── */
const nav = document.getElementById('navbar');

// ── Tab System ─────────────────────────────────────
const ALL_TABS = ['home', 'home-cta', 'about', 'features', 'commands', 'stats', 'games'];
const HOME_TABS = ['home'];

function showTab(targetId) {
    document.body.className = targetId + '-tab-active';
    
    ALL_TABS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const footer = document.getElementById('site-footer');

    if (targetId === 'home') {
        HOME_TABS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('active');
        });
        if (footer) footer.style.display = '';
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    } else if (targetId === 'stats') {
        const statsEl = document.getElementById('stats');
        const ctaEl = document.getElementById('home-cta');
        if (statsEl) statsEl.classList.add('active');
        if (ctaEl) ctaEl.classList.add('active');
        if (footer) footer.style.display = 'none';
    } else {
        const el = document.getElementById(targetId);
        if (el) el.classList.add('active');
        if (footer) footer.style.display = 'none';
    }

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
window.heroUptimeSec = 3131; // Initial default ~52m

function updateStatText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Immediate initial values so cards never show empty
updateStatText('hero-servers', '1');
updateStatText('hero-members', '50');
updateStatText('hero-ping', '106 ms');
updateStatText('hero-uptime', '52m');
updateStatText('about-servers', '1');
updateStatText('about-users', '50');
updateStatText('about-ping', '106ms');

async function fetchPublicStats() {
    try {
        let d = null;
        try {
            const r = await fetch('/api/bot_data?t=' + Date.now());
            if (r.ok) d = await r.json();
        } catch(e) {}

        if (!d) {
            try {
                const r2 = await fetch('http://157.90.181.183:23063/api/public_stats?t=' + Date.now());
                if (r2.ok) d = await r2.json();
            } catch(e) {}
        }
        
        if (!d) return;
        
        const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;
        const displayServers = 1;
        const displayUsers = d.total_users || 50;
        
        updateStatText('hero-servers', fmt(displayServers));
        updateStatText('hero-members', fmt(displayUsers));
        updateStatText('hero-ping', (d.ping || 106) + ' ms');
        
        if (d.uptime_seconds !== undefined) {
            window.heroUptimeSec = d.uptime_seconds;
        } else if (d.uptime) {
            updateStatText('hero-uptime', d.uptime);
        }
        
        updateStatText('about-servers', fmt(displayServers));
        updateStatText('about-users', fmt(displayUsers));
        updateStatText('about-ping', (d.ping || 106) + 'ms');
        
        const sc = document.getElementById('server-count-stat');
        const uc = document.getElementById('user-count-stat');
        const cc = document.getElementById('cmd-count-stat');
        if (sc) sc.textContent = displayServers;
        if (uc) uc.textContent = displayUsers;
        if (cc && d.total_commands) cc.textContent = d.total_commands;
        
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
    "Valorant": "https://cdn1.epicgames.com/offer/cbd5b3d355044b3e9508ece594d73507/EGS_VALORANT_RiotGames_S2_1200x1600-e7f0b5d9be69022634e56598c433364f?h=480&resize=1&w=360",
    "VALORANT": "https://cdn1.epicgames.com/offer/cbd5b3d355044b3e9508ece594d73507/EGS_VALORANT_RiotGames_S2_1200x1600-e7f0b5d9be69022634e56598c433364f?h=480&resize=1&w=360",
    "Minecraft": "https://cdn1.epicgames.com/offer/23114a806ec040909ff7b4b1a457492c/EGS_Minecraft_MojangStudios_S2_1200x1600-0e11894d306b3a3250b8ebae80447385?h=480&resize=1&w=360",
    "Roblox": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80",
    "ROBLOX": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80",
    "Fortnite": "https://cdn1.epicgames.com/offer/fn/Blade_2560x1440_2560x1440-ae7b0849d44e591be2580a5fb7a3ff99?h=480&resize=1&w=360",
    "Genshin Impact": "https://cdn1.epicgames.com/offer/879b0d8776ab46a59a129983baababf0/EGS_GenshinImpact_miHoYoLimited_S2_1200x1600-c12cdab43ca00742e995adfd50b0ba67?h=480&resize=1&w=360",
    "Honkai: Star Rail": "https://cdn1.epicgames.com/offer/4592928509374c439eb46d0a790db86c/EGS_HonkaiStarRail_COGNOSPHEREPTE_S2_1200x1600-5bb95183db7298642a865f12e84c98f8?h=480&resize=1&w=360",
    "Forza Horizon 5": "https://steamcdn-a.akamaihd.net/steam/apps/1551360/library_600x900_2x.jpg",
    "EA Sports FC 24": "https://steamcdn-a.akamaihd.net/steam/apps/2195250/library_600x900_2x.jpg",
    "EA SPORTS FC™ 24": "https://steamcdn-a.akamaihd.net/steam/apps/2195250/library_600x900_2x.jpg",
    "EA SPORTS FC 25": "https://steamcdn-a.akamaihd.net/steam/apps/2669320/library_600x900_2x.jpg",
    "Wuthering Waves": "https://cdn1.epicgames.com/offer/7521798363714856aee6dfa3ff4d284a/EGS_WutheringWaves_KuroGames_S2_1200x1600-bdfcb7d5d2cc8a0a9ed6d35dcfe6b31c?h=480&resize=1&w=360",
    "League of Legends": "https://brand.riotgames.com/static/a9e87d7c0fa30e2a4a6321918b11e8d4/829b3/lol-logo.png",
    "PUBG: BATTLEGROUNDS": "https://steamcdn-a.akamaihd.net/steam/apps/578080/library_600x900_2x.jpg",
    "Grand Theft Auto V": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "Grand Theft Auto V Legacy": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "GTA V": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "Counter-Strike 2": "https://steamcdn-a.akamaihd.net/steam/apps/730/library_600x900_2x.jpg",
    "CS2": "https://steamcdn-a.akamaihd.net/steam/apps/730/library_600x900_2x.jpg",
    "Red Dead Redemption 2": "https://steamcdn-a.akamaihd.net/steam/apps/1174180/library_600x900_2x.jpg",
    "Apex Legends": "https://steamcdn-a.akamaihd.net/steam/apps/1172470/library_600x900_2x.jpg",
    "Call of Duty": "https://steamcdn-a.akamaihd.net/steam/apps/1938090/library_600x900_2x.jpg",
    "Dota 2": "https://steamcdn-a.akamaihd.net/steam/apps/570/library_600x900_2x.jpg",
    "Overwatch 2": "https://steamcdn-a.akamaihd.net/steam/apps/2357570/library_600x900_2x.jpg",
    "Rust": "https://steamcdn-a.akamaihd.net/steam/apps/252490/library_600x900_2x.jpg",
    "Cyberpunk 2077": "https://steamcdn-a.akamaihd.net/steam/apps/1091500/library_600x900_2x.jpg",
    "Black Myth: Wukong": "https://steamcdn-a.akamaihd.net/steam/apps/2358720/library_600x900_2x.jpg",
    "Rocket League": "https://cdn1.epicgames.com/offer/9773aa1aa54f4f7b80e44bef04986cea/EGS_RocketLeague_PsyonixLLC_S2_1200x1600-ee719e782847a9efec47cfc1fec25b29?h=480&resize=1&w=360"
};

const DEFAULT_COMMUNITY_GAMES = [
    { name: "Grand Theft Auto V", count: 2 },
    { name: "VALORANT", count: 1 },
    { name: "Minecraft", count: 1 },
    { name: "Counter-Strike 2", count: 1 },
    { name: "ROBLOX", count: 1 },
    { name: "PUBG: BATTLEGROUNDS", count: 1 },
    { name: "Wuthering Waves", count: 1 },
    { name: "Forza Horizon 5", count: 1 }
];

function getGameImageUrl(gameName) {
    if (!gameName) return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80';
    for (const [key, url] of Object.entries(GAME_IMAGE_OVERRIDES)) {
        if (gameName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(gameName.toLowerCase())) {
            return url;
        }
    }
    return 'https://steamcdn-a.akamaihd.net/steam/apps/730/library_600x900_2x.jpg';
}

function renderLiveGames(gamesList) {
    const grid = document.getElementById('live-games-grid');
    if (!grid) return;
    
    const games = (gamesList && gamesList.length > 0) ? gamesList : DEFAULT_COMMUNITY_GAMES;
    grid.innerHTML = '';
    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <img src="${getGameImageUrl(game.name)}" alt="${game.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80';">
            <div class="game-name">${game.name} <span style="font-size: 0.8rem; opacity: 0.7; margin-left: 5px;">(${game.count || 1})</span></div>
        `;
        grid.appendChild(card);
    });
}

// Initial fetch
fetchPublicStats();
renderLiveGames([]);
setInterval(fetchPublicStats, 10000);

// ── Real-time Uptime Counter ──
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
        updateStatText('hero-uptime', timeStr.trim());
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
    analyser.fftSize = 128;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function animateVisualizer(now) {
    if (!isVisualizerRunning) return;
    requestAnimationFrame(animateVisualizer);

    if (now - lastFrameTime < 16) return;
    lastFrameTime = now;
    
    analyser.getByteFrequencyData(dataArray);
    
    let bassSum = 0;
    for(let i = 0; i < 6; i++) {
        bassSum += dataArray[i];
    }
    const bassAvg = bassSum / 6;
    
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

    setTimeout(() => {
        if (bgMusic.paused) {
            togglePlay();
        }
    }, 500);

    const startOnInteraction = () => {
        if (bgMusic.paused) {
            togglePlay();
        }
        document.removeEventListener('click', startOnInteraction);
    };
    document.addEventListener('click', startOnInteraction);
}
