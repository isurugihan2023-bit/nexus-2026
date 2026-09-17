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
updateStatText('hero-members', '46');
updateStatText('hero-ping', '106 ms');
updateStatText('hero-uptime', '52m');
updateStatText('about-servers', '1');
updateStatText('about-users', '46');
updateStatText('about-ping', '106ms');

let currentNinjaNexusMembers = 46;
const activities = ["1 SERVER", "46 MEMBERS", "75+ COMMANDS", "99.99% UPTIME"];
let activityIdx = 0;
const dpTexts = document.querySelectorAll('.dp-dynamic-text');

const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;

function updateMemberDisplays(count) {
    currentNinjaNexusMembers = count;
    updateStatText('hero-members', fmt(count));
    updateStatText('about-users', fmt(count));
    const uc = document.getElementById('user-count-stat');
    if (uc) uc.textContent = count;
    activities[1] = `${fmt(count)} MEMBERS`;
    if (activityIdx === 1 && dpTexts.length > 0) {
        dpTexts.forEach(el => el.textContent = activities[1]);
    }
}

async function fetchBotData() {
    try {
        let r = await fetch('/api/bot_data?t=' + Date.now());
        if (!r.ok) {
            r = await fetch('http://157.90.181.183:23063/api/public_stats?t=' + Date.now());
        }
        if (r.ok) {
            const d = await r.json();
            if (d) {
                if (d.ping) {
                    updateStatText('hero-ping', d.ping + ' ms');
                    updateStatText('about-ping', d.ping + 'ms');
                }
                if (d.uptime_seconds !== undefined) {
                    window.heroUptimeSec = d.uptime_seconds;
                } else if (d.uptime) {
                    updateStatText('hero-uptime', d.uptime);
                }
                if (d.total_commands) {
                    const cc = document.getElementById('cmd-count-stat');
                    if (cc) cc.textContent = d.total_commands;
                }
                if (d.ninja_nexus_members) {
                    updateMemberDisplays(d.ninja_nexus_members);
                }
                if (d.top_played_games && Array.isArray(d.top_played_games)) {
                    renderLiveGames(d.top_played_games);
                }
            }
        }
    } catch(e) {
        console.warn('Bot data notice:', e);
    }
}

async function fetchDiscordStats() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const r = await fetch('https://discord.com/api/v10/invites/fZNDG5sfhf?with_counts=true', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (r.ok) {
            const disc = await r.json();
            const count = disc.approximate_member_count || (disc.guild && disc.guild.member_count);
            if (count) updateMemberDisplays(count);
        }
    } catch(e) {}
}

async function fetchPublicStats() {
    fetchBotData();
    fetchDiscordStats();
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
    "fivem": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "ceylon": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
    "dream creation": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
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

let lastGamesDigest = '';

function renderLiveGames(gamesList) {
    window.hasRenderedLiveGames = true;
    const grid = document.getElementById('live-games-grid');
    if (!grid) return;

    const isRealData = Array.isArray(gamesList) && gamesList.length > 0;
    const games = isRealData ? gamesList : DEFAULT_COMMUNITY_GAMES;

    const digest = JSON.stringify(games.map(g => ({
        name: g.name,
        count: g.count,
        players: g.players,
        details: g.player_details ? g.player_details.map(p => p.details) : []
    })));
    if (digest === lastGamesDigest && grid.children.length > 0 && !grid.querySelector('.skeleton-card')) {
        return;
    }
    lastGamesDigest = digest;

    let totalPlayersCount = 0;
    games.forEach(g => {
        totalPlayersCount += (g.count || (g.players ? g.players.length : 1));
    });
    const totalPlayersEl = document.getElementById('lounge-total-players');
    if (totalPlayersEl) {
        totalPlayersEl.textContent = isRealData 
            ? `${totalPlayersCount} ${totalPlayersCount === 1 ? 'Player' : 'Players'} In-Game`
            : 'Community Roster';
    }

    grid.innerHTML = '';

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card reveal visible';
        const isLive = isRealData || (game.is_live === true);
        const count = game.count || (game.players ? game.players.length : 1);
        const matchDetail = game.sample_detail || (game.player_details && game.player_details[0] && game.player_details[0].details) || 'Active Discord Session';

        const liveBadgeHtml = isLive
            ? `<div class="game-live-badge"><span class="lounge-live-dot"></span> LIVE</div>`
            : `<div class="game-live-badge" style="color: #94a3b8; border-color: rgba(255,255,255,0.15);"><i class="fas fa-gamepad"></i> FEATURED</div>`;

        const countBadgeHtml = `<div class="game-player-badge"><i class="fas fa-user-friends" style="color: var(--p400);"></i> ${count} ${count === 1 ? 'Player' : 'Players'}</div>`;

        const playerDetails = game.player_details || (game.players ? game.players.map(p => ({ name: p, avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', details: matchDetail })) : []);
        const maxVisible = 4;
        const visiblePlayers = playerDetails.slice(0, maxVisible);
        const overflowCount = playerDetails.length - maxVisible;

        let avatarsHtml = '<div class="avatar-stack">';
        visiblePlayers.forEach(p => {
            const avatarUrl = p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            const detailStr = p.details ? escapeHtml(p.details) : 'Playing';
            avatarsHtml += `
                <div class="interactive-avatar-wrap">
                    <img src="${avatarUrl}" alt="${escapeHtml(p.name)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png';">
                    <div class="player-tooltip">
                        <span class="tooltip-name">${escapeHtml(p.name)}</span>
                        <span class="tooltip-status">${detailStr}</span>
                    </div>
                </div>
            `;
        });
        if (overflowCount > 0) {
            avatarsHtml += `<div class="avatar-overflow">+${overflowCount}</div>`;
        }
        avatarsHtml += '</div>';

        const coverUrl = getGameImageUrl(game);

        card.innerHTML = `
            <div class="game-card-img-wrap">
                ${liveBadgeHtml}
                ${countBadgeHtml}
                <img src="${coverUrl}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.src='https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg';">
            </div>
            <div class="game-card-body">
                <div class="game-name" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
                <div class="game-match-detail" title="${escapeHtml(matchDetail)}">${escapeHtml(matchDetail)}</div>
                <div class="game-players-strip">
                    ${avatarsHtml}
                    <span class="game-action-btn">
                        <i class="fas fa-expand-alt"></i> View Squad
                    </span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            openGameModal(game, coverUrl, matchDetail);
        });

        grid.appendChild(card);
    });
}

renderLiveGames([]);

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const gameModal = document.getElementById('game-session-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalBackdrop = document.getElementById('modal-backdrop-close');

function openGameModal(game, coverUrl, matchDetail) {
    if (!gameModal) return;
    const coverEl = document.getElementById('modal-game-cover');
    const titleEl = document.getElementById('modal-game-title');
    const countEl = document.getElementById('modal-game-count');
    const listEl = document.getElementById('modal-players-list');

    const count = game.count || (game.players ? game.players.length : 1);
    if (coverEl) coverEl.src = coverUrl || getGameImageUrl(game);
    if (titleEl) titleEl.textContent = game.name;
    if (countEl) countEl.textContent = `${count} ${count === 1 ? 'Member' : 'Members'} Active in Session`;

    const players = game.player_details || (game.players ? game.players.map(p => ({ name: p, avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', details: matchDetail })) : []);

    if (listEl) {
        listEl.innerHTML = '';
        players.forEach(p => {
            const item = document.createElement('div');
            item.className = 'modal-player-item';
            item.innerHTML = `
                <img class="modal-player-avatar" src="${p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="${escapeHtml(p.name)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png';">
                <div class="modal-player-info">
                    <div class="modal-player-name">${escapeHtml(p.name)}</div>
                    <div class="modal-player-detail">${p.details ? escapeHtml(p.details) : 'In Discord Gaming Session'}</div>
                </div>
                <span style="font-size: 0.72rem; color: #2ecc71; font-weight: 700; display: flex; align-items: center; gap: 5px;">
                    <span class="lounge-live-dot" style="width: 5px; height: 5px;"></span> Playing
                </span>
            `;
            listEl.appendChild(item);
        });
    }

    gameModal.classList.add('active');
    gameModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeGameModal() {
    if (!gameModal) return;
    gameModal.classList.remove('active');
    gameModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeGameModal);
if (modalBackdrop) modalBackdrop.addEventListener('click', closeGameModal);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGameModal();
});

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
