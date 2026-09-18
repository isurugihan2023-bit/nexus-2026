/* ── Navbar scroll ── */
const nav = document.getElementById('navbar');

const ALL_TABS = ['home', 'lounge', 'home-cta', 'about', 'features', 'commands', 'stats'];
const HOME_TABS = ['home'];

function showTab(targetId) {
    document.body.className = targetId + '-tab-active';
    
    ALL_TABS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    if (targetId === 'home') {
        HOME_TABS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('active');
        });
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    } else if (targetId === 'lounge') {
        const loungeEl = document.getElementById('lounge');
        if (loungeEl) loungeEl.classList.add('active');
    } else if (targetId === 'stats') {
        const statsEl = document.getElementById('stats');
        const ctaEl = document.getElementById('home-cta');
        if (statsEl) statsEl.classList.add('active');
        if (ctaEl) ctaEl.classList.add('active');
    } else {
        const el = document.getElementById(targetId);
        if (el) el.classList.add('active');
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

// Handle initial URL hash on page load
if (window.location.hash) {
    const initialTab = window.location.hash.substring(1);
    if (ALL_TABS.includes(initialTab)) {
        const activeNav = document.querySelector(`.nav-links a[href="#${initialTab}"]`);
        if (activeNav) activeNav.classList.add('active');
        showTab(initialTab);
    }
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

function updateLoungeStats(totalMembers, onlineNow, playingCount) {
    const totalEl = document.getElementById('lounge-stat-total');
    const onlineEl = document.getElementById('lounge-stat-online');
    const playingEl = document.getElementById('lounge-stat-playing');

    if (totalEl && totalMembers !== undefined && totalMembers !== null) {
        totalEl.textContent = totalMembers;
    }
    if (onlineEl && onlineNow !== undefined && onlineNow !== null) {
        onlineEl.textContent = onlineNow;
    }
    if (playingEl && playingCount !== undefined && playingCount !== null) {
        playingEl.textContent = playingCount;
    }
}

async function fetchBotData() {
    let d = null;
    const endpoints = [
        '/api/bot_data?_t=' + Date.now(),
        '/api/public_stats?_t=' + Date.now(),
        'http://157.90.181.183:23063/api/public_stats?_t=' + Date.now()
    ];

    for (const url of endpoints) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const r = await fetch(url, { 
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);
            if (r.ok) {
                const parsed = await r.json();
                if (parsed && (parsed.top_played_games || parsed.total_users || parsed.uptime || parsed.ping)) {
                    d = parsed;
                    break;
                }
            }
        } catch(err) {
            // Failover gracefully
        }
    }

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
        const liveGames = (d.top_played_games && d.top_played_games.length > 0)
            ? d.top_played_games
            : (d.playing_games && d.playing_games.length > 0 ? d.playing_games : []);

        const totalMembers = (d.total_users !== undefined && d.total_users !== null)
            ? d.total_users
            : (d.ninja_nexus_members || 0);
        const onlineNow = (d.online_users !== undefined && d.online_users !== null)
            ? d.online_users
            : (d.presence_count !== undefined ? d.presence_count : 0);
        const playingCount = liveGames.reduce((acc, g) => acc + (g.count || (g.players ? g.players.length : 1)), 0);

        updateLoungeStats(totalMembers, onlineNow, playingCount);
        renderLiveGames(liveGames);
    } else if (!window.hasRenderedLiveGames) {
        renderLiveGames([]);
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
            if (count) {
                updateMemberDisplays(count);
                const totalEl = document.getElementById('lounge-stat-total');
                if (totalEl && (totalEl.textContent === '0' || totalEl.textContent === '47')) {
                    totalEl.textContent = count;
                }
            }
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
    "wukong": "https://steamcdn-a.akamaihd.net/steam/apps/2358720/library_600x900_2x.jpg",
    "arc raiders": "https://steamcdn-a.akamaihd.net/steam/apps/1808500/library_600x900_2x.jpg",
    "arc": "https://steamcdn-a.akamaihd.net/steam/apps/1808500/library_600x900_2x.jpg",
    "brawlhalla": "https://steamcdn-a.akamaihd.net/steam/apps/291550/library_600x900_2x.jpg",
    "visual studio code": "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png",
    "vscode": "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png",
    "code": "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png",
    "wallpaper engine": "https://steamcdn-a.akamaihd.net/steam/apps/431960/library_600x900_2x.jpg",
    "wallpaper": "https://steamcdn-a.akamaihd.net/steam/apps/431960/library_600x900_2x.jpg"
};

const GAME_METADATA = {
    "wallpaper engine": { tag: "Utility", icon: "fa-desktop" },
    "wallpaper": { tag: "Utility", icon: "fa-desktop" },
    "brawlhalla": { tag: "Platform Fighter", icon: "fa-fist-raised" },
    "visual studio code": { tag: "Development", icon: "fa-code" },
    "vscode": { tag: "Development", icon: "fa-code" },
    "ceylon": { tag: "FiveM Roleplay", icon: "fa-car" },
    "dream creation": { tag: "FiveM Studio", icon: "fa-code" },
    "fivem": { tag: "FiveM Roleplay", icon: "fa-car" },
    "grand theft auto": { tag: "GTA V / FiveM", icon: "fa-car" },
    "gta": { tag: "GTA V / FiveM", icon: "fa-car" },
    "valorant": { tag: "Tactical FPS", icon: "fa-crosshairs" },
    "pubg": { tag: "Battle Royale", icon: "fa-crosshairs" },
    "battlegrounds": { tag: "Battle Royale", icon: "fa-crosshairs" },
    "minecraft": { tag: "Sandbox Survival", icon: "fa-cube" },
    "counter-strike": { tag: "Competitive FPS", icon: "fa-bullseye" },
    "cs2": { tag: "Competitive FPS", icon: "fa-bullseye" },
    "forza": { tag: "Sim Racing", icon: "fa-flag-checkered" },
    "apex": { tag: "Battle Royale", icon: "fa-shield-halved" },
    "roblox": { tag: "Platform Sandbox", icon: "fa-shapes" },
    "red dead": { tag: "Open World RPG", icon: "fa-hat-cowboy" },
    "rdr": { tag: "Open World RPG", icon: "fa-hat-cowboy" },
    "cyberpunk": { tag: "Cyber RPG", icon: "fa-microchip" },
    "rust": { tag: "Survival", icon: "fa-hammer" },
    "dota": { tag: "MOBA Strategy", icon: "fa-chess-knight" },
    "wukong": { tag: "Action RPG", icon: "fa-dragon" },
    "wuthering waves": { tag: "Action RPG", icon: "fa-bolt" },
    "league of legends": { tag: "MOBA Arena", icon: "fa-shield" },
    "arc raiders": { tag: "Extraction Shooter", icon: "fa-crosshairs" },
    "arc": { tag: "Extraction Shooter", icon: "fa-crosshairs" }
};

function getGameTheme(gameName) {
    let tag = "Live Gaming";
    let icon = "fa-gamepad";
    if (gameName) {
        const lower = gameName.toLowerCase();
        for (const [k, meta] of Object.entries(GAME_METADATA)) {
            if (lower.includes(k)) {
                tag = meta.tag;
                icon = meta.icon;
                break;
            }
        }
    }
    return {
        accent: "#a855f7",
        border: "rgba(168, 85, 247, 0.35)",
        tag: tag,
        icon: icon
    };
}

const DEFAULT_COMMUNITY_GAMES = [];

// ── Phase 5: Typical squad sizes per game ──
const TYPICAL_SQUAD_SIZES = {
    "valorant": 5, "pubg": 4, "battlegrounds": 4, "counter-strike": 5, "cs2": 5,
    "apex": 3, "rocket league": 3, "fortnite": 4, "brawlhalla": 2, "dota": 5,
    "league of legends": 5, "rust": 4, "arc raiders": 3, "arc": 3, "r6": 5, "rainbow six": 5
};

// ── Phase 3: Automated Metadata Cache & Async Ingestion ──
const GAME_METADATA_CACHE = {};

async function fetchGameMetadata(gameName) {
    if (!gameName) return null;
    const lower = gameName.toLowerCase().trim();
    if (GAME_METADATA_CACHE[lower]) return GAME_METADATA_CACHE[lower];

    try {
        const resp = await fetch(`/api/games/${encodeURIComponent(gameName)}`);
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.game && data.game.cover_url) {
                GAME_METADATA_CACHE[lower] = data.game;
                // Dynamically update card cover if displayed
                const grid = document.getElementById('live-games-grid');
                if (grid) {
                    const card = grid.querySelector(`.game-card[data-game-name="${CSS.escape(gameName)}"]`);
                    if (card) {
                        const img = card.querySelector('.game-card-img-wrap img');
                        if (img && img.src.includes('unsplash.com')) {
                            img.src = data.game.cover_url;
                        }
                    }
                }
                return data.game;
            }
        }
    } catch (e) {
        // Fallback gracefully
    }
    return null;
}

function getGameImageUrl(game) {
    if (typeof game === 'string') {
        const lower = game.toLowerCase();
        for (const [key, url] of Object.entries(GAME_IMAGE_OVERRIDES)) {
            if (lower.includes(key)) return url;
        }
        if (GAME_METADATA_CACHE[lower] && GAME_METADATA_CACHE[lower].cover_url) {
            return GAME_METADATA_CACHE[lower].cover_url;
        }
        fetchGameMetadata(game);
        return 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80';
    }
    if (game && game.rich_cover) return game.rich_cover;
    if (game && game.player_details && game.player_details[0] && game.player_details[0].rich_cover) {
        return game.player_details[0].rich_cover;
    }
    const gameName = game && game.name ? game.name : '';
    return getGameImageUrl(gameName);
}

let lastGamesDigest = '';
window.currentLiveGamesState = [];

function renderLiveGames(gamesList) {
    window.hasRenderedLiveGames = true;
    const grid = document.getElementById('live-games-grid');
    if (!grid) return;

    if (!Array.isArray(gamesList) || gamesList.length === 0) {
        window.currentLiveGamesState = [];
        grid.classList.remove('single-game');
        const totalPlayersEl = document.getElementById('lounge-total-players');
        if (totalPlayersEl) {
            totalPlayersEl.textContent = '0 Players In-Game';
        }
        const playingEl = document.getElementById('lounge-stat-playing');
        if (playingEl) {
            playingEl.textContent = '0';
        }
        if (lastGamesDigest === 'EMPTY' && grid.children.length === 0) {
            return;
        }
        lastGamesDigest = 'EMPTY';
        grid.innerHTML = '';
        return;
    }

    const games = gamesList;
    window.currentLiveGamesState = games;

    if (games.length === 1) {
        grid.classList.add('single-game');
    } else {
        grid.classList.remove('single-game');
    }

    const digest = JSON.stringify(games.map(g => ({
        name: g.name,
        count: g.count,
        players: g.players,
        player_names: g.player_details ? g.player_details.map(p => p.name) : [],
        avatars: g.player_details ? g.player_details.map(p => p.avatar) : [],
        details: g.player_details ? g.player_details.map(p => p.details) : []
    })));
    if (digest === lastGamesDigest && grid.children.length > 0) {
        return;
    }
    lastGamesDigest = digest;

    let totalPlayersCount = 0;
    games.forEach(g => {
        totalPlayersCount += (g.count || (g.players ? g.players.length : 1));
    });
    const totalPlayersEl = document.getElementById('lounge-total-players');
    if (totalPlayersEl) {
        totalPlayersEl.textContent = `${totalPlayersCount} ${totalPlayersCount === 1 ? 'Player' : 'Players'} In-Game`;
    }
    const playingEl = document.getElementById('lounge-stat-playing');
    if (playingEl) {
        playingEl.textContent = totalPlayersCount;
    }

    let maxPlayers = 0;
    games.forEach(g => {
        const c = g.count || (g.players ? g.players.length : 1);
        if (c > maxPlayers) maxPlayers = c;
    });

    grid.innerHTML = '';

    games.forEach((game, idx) => {
        const card = document.createElement('div');
        const count = game.count || (game.players ? game.players.length : 1);
        const isLive = true;
        const isHot = maxPlayers >= 2 && count === maxPlayers;

        const theme = getGameTheme(game.name);

        card.className = `game-card reveal visible ${isHot ? 'is-hot' : ''}`;
        card.setAttribute('data-game-name', game.name);
        card.style.setProperty('--game-accent', theme.accent);
        card.style.setProperty('--game-accent-border', theme.border);

        let matchDetail = game.sample_detail || (game.player_details && game.player_details[0] && game.player_details[0].details) || 'Active Discord Session';
        if (matchDetail.includes('???') || !matchDetail.trim()) {
            matchDetail = 'Active Session';
        }

        let detailIcon = 'fa-gamepad';
        const lowerDetail = matchDetail.toLowerCase();
        if (lowerDetail.includes('player') || lowerDetail.includes('server')) {
            detailIcon = 'fa-server';
        } else if (lowerDetail.includes('watch') || lowerDetail.includes('spectat')) {
            detailIcon = 'fa-eye';
        } else if (lowerDetail.includes('match') || lowerDetail.includes('5v5') || lowerDetail.includes('taego') || lowerDetail.includes('erangel') || lowerDetail.includes('lobby')) {
            detailIcon = 'fa-crosshairs';
        }

        const liveBadgeHtml = isLive
            ? `<div class="game-live-badge"><span class="game-live-dot-pulse"></span> LIVE</div>`
            : `<div class="game-live-badge" style="color: #94a3b8; border-color: rgba(255,255,255,0.15);"><i class="fas fa-gamepad"></i> FEATURED</div>`;

        const hotBadgeHtml = isHot ? `<div class="game-hot-badge"><i class="fas fa-fire"></i> HOT</div>` : '';
        const countBadgeHtml = `<div class="game-player-badge"><i class="fas fa-users"></i> ${count} In Session</div>`;

        // Squad size prompt calculation
        let squadPromptHtml = '';
        if (game.name) {
            const lowerName = game.name.toLowerCase();
            for (const [k, standardSize] of Object.entries(TYPICAL_SQUAD_SIZES)) {
                if (lowerName.includes(k)) {
                    const needed = standardSize - count;
                    if (needed > 0) {
                        squadPromptHtml = `<div class="game-squad-prompt"><i class="fas fa-user-plus"></i> ${needed} needed for squad</div>`;
                    }
                    break;
                }
            }
        }

        const playerDetails = game.player_details || (game.players ? game.players.map(p => ({ name: (typeof p === 'string' ? p : p.name), avatar: (p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'), details: matchDetail })) : []);
        const maxVisible = 4;
        const visiblePlayers = playerDetails.slice(0, maxVisible);
        const overflowCount = playerDetails.length - maxVisible;

        const playerNamesList = (game.player_details && game.player_details.length > 0)
            ? game.player_details.map(p => (typeof p === 'string' ? p : (p.name || 'Member')))
            : (game.players && game.players.length > 0 ? game.players.map(p => (typeof p === 'string' ? p : (p.name || 'Member'))) : ['Community Member']);

        let playerHeadlineText = '';
        if (playerNamesList.length === 1) {
            playerHeadlineText = playerNamesList[0];
        } else if (playerNamesList.length === 2) {
            playerHeadlineText = `${playerNamesList[0]} & ${playerNamesList[1]}`;
        } else {
            playerHeadlineText = `${playerNamesList[0]} +${playerNamesList.length - 1} others`;
        }

        let avatarsHtml = '<div class="avatar-stack">';
        visiblePlayers.forEach(p => {
            const pName = typeof p === 'string' ? p : (p.name || 'Member');
            const avatarUrl = p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            let detailStr = p.details ? p.details : 'Playing';
            if (detailStr.includes('???') || !detailStr.trim()) detailStr = 'In Session';

            avatarsHtml += `
                <img src="${avatarUrl}" alt="${escapeHtml(pName)}" title="${escapeHtml(pName)} - ${escapeHtml(detailStr)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png';">
            `;
        });
        if (overflowCount > 0) {
            avatarsHtml += `<div class="avatar-overflow">+${overflowCount}</div>`;
        }
        avatarsHtml += '</div>';

        const coverUrl = getGameImageUrl(game);

        card.innerHTML = `
            <div class="game-card-img-wrap">
                <div class="game-card-top-badges">
                    <div class="game-top-badges-left">
                        ${liveBadgeHtml}
                        ${hotBadgeHtml}
                    </div>
                    ${countBadgeHtml}
                </div>
                <img src="${coverUrl}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80';">
            </div>
            <div class="game-card-body">
                <div class="game-genre-tag"><i class="fas ${theme.icon || 'fa-circle'}" style="font-size: 0.65rem;"></i> ${escapeHtml(theme.tag)}</div>
                <div class="game-name" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
                <div class="game-match-detail" title="${escapeHtml(matchDetail)}"><i class="fas ${detailIcon}"></i> ${escapeHtml(matchDetail)}</div>
                ${squadPromptHtml}
                <div class="game-players-strip">
                    ${avatarsHtml}
                    <div class="game-player-headline" title="${escapeHtml(playerNamesList.join(', '))}">
                        <span class="game-player-name">${escapeHtml(playerHeadlineText)}</span>
                    </div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            openGameModal(game, coverUrl, matchDetail);
        });

        grid.appendChild(card);
    });
}

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

try { localStorage.removeItem('nexus_player_sessions'); } catch (e) {}

function formatElapsedTime(startTimeMs) {
    if (!startTimeMs) return '';
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
    const hours = Math.floor(elapsedSec / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    const secs = elapsedSec % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m elapsed`;
    }
    if (mins > 0) {
        return `${mins}m ${secs < 10 ? '0' + secs : secs}s elapsed`;
    }
    return `${secs}s elapsed`;
}

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
            const pName = typeof p === 'string' ? p : (p.name || 'Member');
            const avatarUrl = p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            let detailStr = p.details ? escapeHtml(p.details) : 'In Discord Gaming Session';
            if (detailStr.includes('???') || !detailStr.trim()) detailStr = 'In Discord Gaming Session';

            const startTime = (p.start_timestamp ? (p.start_timestamp > 1e11 ? p.start_timestamp : p.start_timestamp * 1000) : null) ||
                              (p.timestamps && p.timestamps.start ? (p.timestamps.start > 1e11 ? p.timestamps.start : p.timestamps.start * 1000) : null) ||
                              (p.created_at ? new Date(p.created_at).getTime() : null);

            const timeBadgeHtml = startTime ? `
                <div class="modal-activity-time" data-start="${startTime}">
                    <i class="far fa-clock"></i> <span class="time-text">${formatElapsedTime(startTime)}</span>
                </div>
            ` : '';

            const item = document.createElement('div');
            item.className = 'modal-player-item';
            item.innerHTML = `
                <img class="modal-player-avatar" src="${avatarUrl}" alt="${escapeHtml(pName)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png';">
                <div class="modal-player-info">
                    <div class="modal-player-name">${escapeHtml(pName)}</div>
                    <div class="modal-player-detail">${detailStr}</div>
                </div>
                <div class="modal-player-status-side">
                    <div class="modal-status-badge">
                        <span class="lounge-live-dot" style="width: 5px; height: 5px;"></span> Playing
                    </div>
                    ${timeBadgeHtml}
                </div>
            `;
            listEl.appendChild(item);
        });

        if (window.modalActivityInterval) clearInterval(window.modalActivityInterval);
        const timeEls = listEl.querySelectorAll('.modal-activity-time');
        if (timeEls.length > 0) {
            window.modalActivityInterval = setInterval(() => {
                timeEls.forEach(el => {
                    const start = parseInt(el.getAttribute('data-start'), 10);
                    if (start) {
                        const txt = el.querySelector('.time-text');
                        if (txt) txt.textContent = formatElapsedTime(start);
                    }
                });
            }, 1000);
        }
    }

    gameModal.classList.add('active');
    gameModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeGameModal() {
    if (!gameModal) return;
    if (window.modalActivityInterval) {
        clearInterval(window.modalActivityInterval);
        window.modalActivityInterval = null;
    }
    gameModal.classList.remove('active');
    gameModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeGameModal);
if (modalBackdrop) modalBackdrop.addEventListener('click', closeGameModal);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGameModal();
});

// ── Real-Time Sync Indicator ──
function updateSyncStatus(mode) {
    const dot = document.getElementById('sync-status-dot');
    const text = document.getElementById('sync-status-text');
    if (!dot || !text) return;

    if (mode === 'ws') {
        dot.className = 'sync-status-dot ws-active';
        text.textContent = 'Real-Time Stream (Active)';
    } else if (mode === 'polling') {
        dot.className = 'sync-status-dot polling-active';
        text.textContent = 'Live Sync (4s Interval)';
    } else {
        dot.className = 'sync-status-dot';
        text.textContent = 'Sync Standby';
    }
}

// ── Phase 1: Real-Time WebSocket Engine & Differential Client ──
class NexusLiveSocketClient {
    constructor() {
        this.ws = null;
        this.usingFallbackPolling = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.maxReconnectDelay = 30000;
        this.isExplicitlyPaused = false;

        // Auto-detect TLS: wss:// if HTTPS, ws:// if HTTP
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.NEXUS_WS_HOST || (window.location.protocol === 'https:' ? 'api.ninjanexus.duckdns.org' : '157.90.181.183:23063');
        this.url = window.NEXUS_WS_URL || `${proto}//${host}/ws/live-games`;
    }

    connect() {
        if (this.isExplicitlyPaused) return;

        // Security check: Never attempt plain ws:// on HTTPS to avoid browser console error
        if (window.location.protocol === 'https:' && this.url.startsWith('ws://')) {
            console.warn('[NEXUS Live] Mixed content blocked: ws:// cannot run on HTTPS. Engaging fallback polling.');
            this.engageFallbackPolling();
            return;
        }

        try {
            console.log(`[NEXUS Live] Connecting to WebSocket: ${this.url}`);
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[NEXUS Live] WebSocket stream connected successfully.');
                this.reconnectAttempts = 0;
                this.usingFallbackPolling = false;
                stopStatsPolling();
                updateSyncStatus('ws');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'INITIAL_STATE' && Array.isArray(data.games)) {
                        renderLiveGames(data.games);
                    } else if (data.type === 'DELTA_UPDATE') {
                        this.applyDelta(data);
                    }
                } catch (e) {
                    console.error('[NEXUS Live] Error parsing WS payload:', e);
                }
            };

            this.ws.onerror = (err) => {
                console.warn('[NEXUS Live] WebSocket connection encountered error. Falling back to REST polling.');
                this.engageFallbackPolling();
            };

            this.ws.onclose = () => {
                console.log('[NEXUS Live] WebSocket connection closed.');
                this.engageFallbackPolling();
                this.scheduleReconnect();
            };
        } catch (err) {
            console.error('[NEXUS Live] Failed to initialize WebSocket:', err);
            this.engageFallbackPolling();
            this.scheduleReconnect();
        }
    }

    applyDelta(delta) {
        const { action, game, player } = delta;
        if (!game) return;

        let games = window.currentLiveGamesState || [];
        let gameObj = games.find(g => g.name.toLowerCase() === game.toLowerCase());

        if (action === 'PLAYER_JOINED') {
            if (!gameObj) {
                gameObj = {
                    name: game,
                    count: 1,
                    is_live: true,
                    players: [player.username || player.name || 'Member'],
                    player_details: [player]
                };
                games.push(gameObj);
                renderLiveGames(games);
                return;
            } else {
                gameObj.count = (gameObj.count || 0) + 1;
                gameObj.players = gameObj.players || [];
                gameObj.player_details = gameObj.player_details || [];
                const pName = player.username || player.name || 'Member';
                if (!gameObj.players.includes(pName)) gameObj.players.push(pName);
                gameObj.player_details.push(player);
            }
        } else if (action === 'PLAYER_LEFT') {
            if (gameObj) {
                const pId = player.player_id || player.id;
                const pName = player.username || player.name;
                gameObj.player_details = (gameObj.player_details || []).filter(p => (p.player_id || p.id) !== pId && p.name !== pName);
                gameObj.players = (gameObj.players || []).filter(n => n !== pName);
                gameObj.count = Math.max(0, gameObj.player_details.length);
                if (gameObj.count === 0) {
                    games = games.filter(g => g.name.toLowerCase() !== game.toLowerCase());
                    renderLiveGames(games);
                    return;
                }
            }
        } else if (action === 'PLAYER_UPDATED') {
            if (gameObj && gameObj.player_details) {
                const pId = player.player_id || player.id;
                const existing = gameObj.player_details.find(p => (p.player_id || p.id) === pId || p.name === player.username);
                if (existing) {
                    existing.details = player.details;
                }
            }
        } else if (action === 'GAME_ENDED') {
            games = games.filter(g => g.name.toLowerCase() !== game.toLowerCase());
            renderLiveGames(games);
            return;
        }

        // Targeted DOM patch to avoid whole grid re-rendering
        const grid = document.getElementById('live-games-grid');
        if (grid && gameObj) {
            const card = grid.querySelector(`.game-card[data-game-name="${CSS.escape(gameObj.name)}"]`);
            if (card) {
                const countBadge = card.querySelector('.game-player-badge');
                if (countBadge) countBadge.innerHTML = `<i class="fas fa-users"></i> ${gameObj.count} In Session`;
                
                const headline = card.querySelector('.game-player-headline .game-player-name');
                if (headline && gameObj.players.length > 0) {
                    headline.textContent = gameObj.players.length === 1
                        ? gameObj.players[0]
                        : (gameObj.players.length === 2 ? `${gameObj.players[0]} & ${gameObj.players[1]}` : `${gameObj.players[0]} +${gameObj.players.length - 1} others`);
                }
                // Update total player count
                let total = 0;
                games.forEach(g => { total += (g.count || 1); });
                const totalEl = document.getElementById('lounge-total-players');
                if (totalEl) totalEl.textContent = `${total} ${total === 1 ? 'Player' : 'Players'} In-Game`;
                return;
            }
        }
        renderLiveGames(games);
    }

    engageFallbackPolling() {
        if (!this.usingFallbackPolling) {
            this.usingFallbackPolling = true;
            startStatsPolling();
            updateSyncStatus('polling');
        }
    }

    scheduleReconnect() {
        if (this.isExplicitlyPaused || this.reconnectTimer) return;
        const delay = Math.min(this.maxReconnectDelay, 1000 * Math.pow(2, this.reconnectAttempts));
        this.reconnectAttempts++;
        console.log(`[NEXUS Live] Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    pause() {
        this.isExplicitlyPaused = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
            this.ws = null;
        }
    }

    resume() {
        this.isExplicitlyPaused = false;
        this.connect();
    }
}

// ── Visibility Change Awareness & Polling Fallback Manager ──
let statsInterval = null;
function startStatsPolling() {
    if (statsInterval) clearInterval(statsInterval);
    fetchPublicStats();
    statsInterval = setInterval(fetchPublicStats, 4000);
}

function stopStatsPolling() {
    if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
    }
}

const liveSocketClient = new NexusLiveSocketClient();

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        liveSocketClient.pause();
        stopStatsPolling();
    } else {
        liveSocketClient.resume();
        if (liveSocketClient.usingFallbackPolling) {
            startStatsPolling();
        }
    }
});

// Initialize real-time WebSocket client (falls back to polling automatically)
liveSocketClient.connect();

// ── Phase 5: Lounge Subnav & Community Stats Loader ──
const FALLBACK_MOST_PLAYED = [
    { game_name: 'PUBG: BATTLEGROUNDS', total_hours: '48.5', unique_players: 'Active Community' },
    { game_name: 'Brawlhalla', total_hours: '32.1', unique_players: 'Active Community' },
    { game_name: 'ARC Raiders', total_hours: '19.8', unique_players: 'Active Community' }
];

function renderMostPlayedCard(g, idx) {
    const gameName = g.game_name || g.name || 'Game';
    const totalHours = g.total_hours || '0';
    const playersText = g.unique_players ? (typeof g.unique_players === 'number' ? `${g.unique_players} Players` : g.unique_players) : 'Active Community';
    const isHot = idx === 0;
    const theme = getGameTheme(gameName);
    const coverUrl = getGameImageUrl(gameName);

    const rankMedal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : ''));
    const rankTitle = idx === 0 ? '1st Place' : (idx === 1 ? '2nd Place' : (idx === 2 ? '3rd Place' : `#${idx + 1}`));
    const rankBadgeText = rankMedal ? `${rankMedal} #${idx + 1}` : `#${idx + 1}`;

    const rankBadgeHtml = `<div class="game-live-badge" title="${rankTitle}"><span class="game-live-dot-pulse"></span> ${rankBadgeText} RANK</div>`;
    const hotBadgeHtml = isHot ? `<div class="game-hot-badge"><i class="fas fa-fire"></i> TOP 1</div>` : '';
    const hoursBadgeHtml = `<div class="game-player-badge"><i class="fas fa-clock"></i> ${totalHours} Hours</div>`;

    return `
        <div class="game-card reveal visible ${isHot ? 'is-hot' : ''}" data-game-name="${escapeHtml(gameName)}" style="--game-accent: ${theme.accent}; --game-accent-border: ${theme.border};">
            <div class="game-card-img-wrap">
                <div class="game-card-top-badges">
                    <div class="game-top-badges-left">
                        ${rankBadgeHtml}
                        ${hotBadgeHtml}
                    </div>
                    ${hoursBadgeHtml}
                </div>
                <img src="${coverUrl}" alt="${escapeHtml(gameName)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80';">
            </div>
            <div class="game-card-body">
                <div class="game-genre-tag"><i class="fas ${theme.icon || 'fa-gamepad'}" style="font-size: 0.65rem;"></i> ${escapeHtml(theme.tag)}</div>
                <div class="game-name" title="${escapeHtml(gameName)}">${escapeHtml(gameName)}</div>
                <div class="game-match-detail" title="${totalHours} Hours Logged"><i class="fas fa-trophy"></i> Top Played This Week</div>
                <div class="game-players-strip">
                    <div class="leaderboard-rank" style="width: 32px; height: 32px; font-size: 0.82rem; margin-right: 2px;"><span class="rank-emoji">${rankMedal || `<span class="rank-num">#${idx+1}</span>`}</span></div>
                    <div class="game-player-headline" style="margin-bottom: 0;">
                        <span class="game-player-name">${escapeHtml(playersText)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function bindMostPlayedCards(container, gamesList) {
    container.querySelectorAll('.game-card').forEach((card, idx) => {
        const g = gamesList[idx];
        if (!g) return;
        const gameName = g.game_name || g.name || 'Game';
        const coverUrl = getGameImageUrl(gameName);
        const totalHours = g.total_hours || '0';
        card.addEventListener('click', () => {
            openGameModal({
                name: gameName,
                count: typeof g.unique_players === 'number' ? g.unique_players : 1,
                players: ['Community Member'],
                player_details: [
                    { name: 'Active Community Member', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', details: `${totalHours} Hours Logged This Week` }
                ]
            }, coverUrl, `${totalHours} Hours Logged This Week`);
        });
    });
}

async function fetchMostPlayedStats() {
    const container = document.getElementById('lounge-most-played-container');
    if (!container) return;

    try {
        const resp = await fetch('/api/stats/most-played?period=week');
        if (!resp.ok) throw new Error('Stats API offline');
        const data = await resp.json();
        const games = (data.games && data.games.length > 0) ? data.games : FALLBACK_MOST_PLAYED;

        let html = `<div class="live-games-grid ${games.length === 1 ? 'single-game' : ''}">`;
        games.forEach((g, idx) => {
            html += renderMostPlayedCard(g, idx);
        });
        html += '</div>';
        container.innerHTML = html;
        bindMostPlayedCards(container, games);
    } catch (err) {
        let html = `<div class="live-games-grid ${FALLBACK_MOST_PLAYED.length === 1 ? 'single-game' : ''}">`;
        FALLBACK_MOST_PLAYED.forEach((g, idx) => {
            html += renderMostPlayedCard(g, idx);
        });
        html += '</div>';
        container.innerHTML = html;
        bindMostPlayedCards(container, FALLBACK_MOST_PLAYED);
    }
}

async function fetchLeaderboardStats() {
    const container = document.getElementById('lounge-leaderboard-container');
    if (!container) return;

    try {
        const resp = await fetch('/api/stats/leaderboard?period=week');
        if (!resp.ok) throw new Error('Leaderboard API offline');
        const data = await resp.json();
        const users = data.leaderboard || [];

        if (users.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 40px; color: #94a3b8;">No player playtime recorded this week. Jump into voice to climb the ranks!</div>`;
            return;
        }

        let html = '<div class="stats-leaderboard-grid">';
        users.forEach((u, idx) => {
            const rankContent = idx === 0 
                ? '<span class="rank-emoji" title="1st Place">🥇</span>' 
                : (idx === 1 
                    ? '<span class="rank-emoji" title="2nd Place">🥈</span>' 
                    : (idx === 2 
                        ? '<span class="rank-emoji" title="3rd Place">🥉</span>' 
                        : `<span class="rank-num">#${idx + 1}</span>`));
            html += `
                <div class="leaderboard-card">
                    <div class="leaderboard-rank">${rankContent}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${escapeHtml(u.username)}</div>
                        <div class="leaderboard-hours">${u.total_hours} Hours • ${u.session_count} Sessions</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `
            <div class="stats-leaderboard-grid">
                <div class="leaderboard-card">
                    <div class="leaderboard-rank"><span class="rank-emoji" title="1st Place">🥇</span></div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">Dodam</div>
                        <div class="leaderboard-hours">26.4 Hours Active</div>
                    </div>
                </div>
                <div class="leaderboard-card">
                    <div class="leaderboard-rank"><span class="rank-emoji" title="2nd Place">🥈</span></div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">PaMuJiThA</div>
                        <div class="leaderboard-hours">18.2 Hours Active</div>
                    </div>
                </div>
                <div class="leaderboard-card">
                    <div class="leaderboard-rank"><span class="rank-emoji" title="3rd Place">🥉</span></div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">Animo</div>
                        <div class="leaderboard-hours">12.5 Hours Active</div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Subnav switcher
document.querySelectorAll('.lounge-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.lounge-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.getAttribute('data-lounge-tab');
        const liveGrid = document.getElementById('live-games-grid');
        const mostPlayed = document.getElementById('lounge-most-played-container');
        const leaderboard = document.getElementById('lounge-leaderboard-container');

        if (liveGrid) liveGrid.style.display = tab === 'live' ? '' : 'none';
        if (mostPlayed) mostPlayed.style.display = tab === 'most-played' ? '' : 'none';
        if (leaderboard) leaderboard.style.display = tab === 'leaderboard' ? '' : 'none';

        if (tab === 'most-played') fetchMostPlayedStats();
        if (tab === 'leaderboard') fetchLeaderboardStats();
    });
});

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
