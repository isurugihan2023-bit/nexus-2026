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
window.heroUptimeSec = 3131;

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
    "valorant": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg",
    "minecraft": "https://images.igdb.com/igdb/image/upload/t_cover_big/co1x7d.jpg",
    "roblox": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2kch.jpg",
    "fortnite": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2767.jpg",
    "genshin": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2040.jpg",
    "wuthering waves": "https://images.igdb.com/igdb/image/upload/t_cover_big/co6m58.jpg",
    "league of legends": "https://images.igdb.com/igdb/image/upload/t_cover_big/co49wp.jpg",
    "grand theft auto": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "gta": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "counter-strike": "https://steamcdn-a.akamaihd.net/steam/apps/730/library_600x900_2x.jpg",
    "cs2": "https://steamcdn-a.akamaihd.net/steam/apps/730/library_600x900_2x.jpg",
    "pubg": "https://steamcdn-a.akamaihd.net/steam/apps/578080/library_600x900_2x.jpg",
    "battlegrounds": "https://steamcdn-a.akamaihd.net/steam/apps/578080/library_600x900_2x.jpg",
    "forza": "https://steamcdn-a.akamaihd.net/steam/apps/1551360/library_600x900_2x.jpg",
    "apex": "https://steamcdn-a.akamaihd.net/steam/apps/1172470/library_600x900_2x.jpg",
    "red dead": "https://steamcdn-a.akamaihd.net/steam/apps/1174180/library_600x900_2x.jpg",
    "rdr": "https://steamcdn-a.akamaihd.net/steam/apps/1174180/library_600x900_2x.jpg",
    "ea sports fc": "https://images.igdb.com/igdb/image/upload/t_cover_big/co8j9u.jpg",
    "fifa": "https://images.igdb.com/igdb/image/upload/t_cover_big/co8j9u.jpg",
    "rocket league": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2097.jpg",
    "cyberpunk": "https://steamcdn-a.akamaihd.net/steam/apps/1091500/library_600x900_2x.jpg",
    "rust": "https://steamcdn-a.akamaihd.net/steam/apps/252490/library_600x900_2x.jpg",
    "dota": "https://steamcdn-a.akamaihd.net/steam/apps/570/library_600x900_2x.jpg",
    "wukong": "https://steamcdn-a.akamaihd.net/steam/apps/2358720/library_600x900_2x.jpg"
};

const DEFAULT_COMMUNITY_GAMES = [
    { name: "Grand Theft Auto V", count: 2, is_live: true, players: [{ name: "N3WB", avatar: "https://cdn.discordapp.com/embed/avatars/0.png" }, { name: "isuru", avatar: "https://cdn.discordapp.com/embed/avatars/1.png" }] },
    { name: "VALORANT", count: 1, is_live: true, players: [{ name: "kiri putha", avatar: "https://cdn.discordapp.com/embed/avatars/2.png" }] },
    { name: "Minecraft", count: 1, is_live: true, players: [{ name: "Pegging Boy", avatar: "https://cdn.discordapp.com/embed/avatars/3.png" }] },
    { name: "Counter-Strike 2", count: 1, is_live: true, players: [{ name: "Haaaaaalan", avatar: "https://cdn.discordapp.com/embed/avatars/4.png" }] },
    { name: "ROBLOX", count: 1, is_live: false, players: [] },
    { name: "PUBG: BATTLEGROUNDS", count: 1, is_live: false, players: [] },
    { name: "Wuthering Waves", count: 1, is_live: false, players: [] },
    { name: "Forza Horizon 5", count: 1, is_live: false, players: [] }
];

function getGameImageUrl(gameName) {
    if (!gameName) return 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg';
    const lower = gameName.toLowerCase();
    for (const [key, url] of Object.entries(GAME_IMAGE_OVERRIDES)) {
        if (lower.includes(key)) {
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
        const isLive = (game.is_live === true) || (game.players && game.players.length > 0);
        
        let liveBadgeHtml = '';
        if (isLive) {
            liveBadgeHtml = `
                <div class="game-live-badge">
                    <span class="game-live-dot"></span> LIVE
                </div>
            `;
        }

        let playersHtml = '';
        if (game.players && game.players.length > 0) {
            const avatarImgs = game.players.map(p => 
                `<img src="${p.avatar}" alt="${p.name}" title="${p.name}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png';">`
            ).join('');
            
            const firstPlayer = game.players[0].name;
            const moreCount = game.players.length - 1;
            const playerText = moreCount > 0 ? `${firstPlayer} +${moreCount}` : firstPlayer;
            
            playersHtml = `
                <div class="game-players-strip">
                    <div class="avatar-stack">${avatarImgs}</div>
                    <span class="player-names-label" title="${game.players.map(p=>p.name).join(', ')}">${playerText}</span>
                </div>
            `;
        } else {
            playersHtml = `
                <div class="game-players-strip">
                    <span class="player-names-label" style="opacity: 0.65;">Community Favorite</span>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="game-card-img-wrap">
                ${liveBadgeHtml}
                <img src="${getGameImageUrl(game.name)}" alt="${game.name}" loading="lazy" onerror="this.src='https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg';">
            </div>
            <div class="game-name">${game.name} <span style="font-size: 0.78rem; opacity: 0.7; font-weight: 500;">(${game.count || 1})</span></div>
            ${playersHtml}
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
