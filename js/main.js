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

    const footer = document.getElementById('site-footer');

    if (targetId === 'home') {
        HOME_TABS.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('active');
        });
        if (footer) footer.style.display = '';
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    } else if (targetId === 'lounge') {
        const loungeEl = document.getElementById('lounge');
        if (loungeEl) loungeEl.classList.add('active');
        if (footer) footer.style.display = '';
    } else if (targetId === 'stats') {
        const statsEl = document.getElementById('stats');
        if (statsEl) statsEl.classList.add('active');
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
        renderLiveGames(liveGames);
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
    "wukong": "https://steamcdn-a.akamaihd.net/steam/apps/2358720/library_600x900_2x.jpg",
    "arc raiders": "https://steamcdn-a.akamaihd.net/steam/apps/1808500/library_600x900_2x.jpg",
    "arc": "https://steamcdn-a.akamaihd.net/steam/apps/1808500/library_600x900_2x.jpg",
    "brawlhalla": "https://steamcdn-a.akamaihd.net/steam/apps/291550/library_600x900_2x.jpg",
    "visual studio code": "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png",
    "vscode": "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png",
    "code": "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png"
};

const GAME_METADATA = {
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

const DEFAULT_COMMUNITY_GAMES = [
    {
        name: "Brawlhalla",
        count: 2,
        is_live: true,
        sample_detail: "Active Discord Session",
        players: ["PaMuJiThA", "Dodam"],
        player_details: [
            { name: "PaMuJiThA", avatar: "https://cdn.discordapp.com/avatars/703218404470816808/a_ad16d37e6320a308c084912daec3db22.gif?size=1024", details: "Playing" },
            { name: "Dodam", avatar: "https://cdn.discordapp.com/avatars/706113392167092276/46fcbfa2b31c84fd30d5f43131cac9dc.png?size=1024", details: "In Lobby" }
        ],
        rich_cover: "https://steamcdn-a.akamaihd.net/steam/apps/291550/library_600x900_2x.jpg"
    },
    {
        name: "ARC Raiders",
        count: 1,
        is_live: true,
        sample_detail: "Active Discord Session",
        players: ["Animo"],
        player_details: [
            { name: "Animo", avatar: "https://cdn.discordapp.com/avatars/1226896502216069130/14b1a6863a88ad6d3ae93635f51c387b.png?size=1024", details: "Playing" }
        ],
        rich_cover: "https://steamcdn-a.akamaihd.net/steam/apps/1808500/library_600x900_2x.jpg"
    },
    {
        name: "Visual Studio Code",
        count: 1,
        is_live: true,
        sample_detail: "Editing targeting.lua",
        players: ["! DINGDONG GAMING"],
        player_details: [
            { name: "! DINGDONG GAMING", avatar: "https://cdn.discordapp.com/avatars/857933823537971210/eb8f3018b0950eda1e2f326169ee0ea6.png?size=1024", details: "Editing targeting.lua" }
        ],
        rich_cover: "https://cdn.discordapp.com/app-assets/1127365366977396867/1127401490118623423.png"
    }
];

function getGameImageUrl(game) {
    if (typeof game === 'string') {
        const lower = game.toLowerCase();
        for (const [key, url] of Object.entries(GAME_IMAGE_OVERRIDES)) {
            if (lower.includes(key)) {
                return url;
            }
        }
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
        player_names: g.player_details ? g.player_details.map(p => p.name) : [],
        avatars: g.player_details ? g.player_details.map(p => p.avatar) : [],
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
        totalPlayersEl.textContent = `${totalPlayersCount} ${totalPlayersCount === 1 ? 'Player' : 'Players'} In-Game`;
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
        const isLive = isRealData || (game.is_live === true);
        const isHot = maxPlayers >= 2 && count === maxPlayers;

        const theme = getGameTheme(game.name);

        card.className = `game-card reveal visible ${isHot ? 'is-hot' : ''}`;
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

        // HOT badge (only when party/squad >= 2)
        const hotBadgeHtml = isHot ? `<div class="game-hot-badge"><i class="fas fa-fire"></i> HOT</div>` : '';
        const countBadgeHtml = `<div class="game-player-badge"><i class="fas fa-users"></i> ${count} In Session</div>`;

        const playerDetails = game.player_details || (game.players ? game.players.map(p => ({ name: (typeof p === 'string' ? p : p.name), avatar: (p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'), details: matchDetail })) : []);
        const maxVisible = 4;
        const visiblePlayers = playerDetails.slice(0, maxVisible);
        const overflowCount = playerDetails.length - maxVisible;

        // Prominently display active player name(s) directly beside the avatar stack
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
                <span style="font-size: 0.72rem; color: #c084fc; font-weight: 700; display: flex; align-items: center; gap: 5px;">
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

// ── Visibility Change Awareness & Polling ──
let statsInterval = null;
function startStatsPolling() {
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(fetchPublicStats, 4000); // Ultra-fast 4s live sync
}
startStatsPolling();

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (statsInterval) clearInterval(statsInterval);
    } else {
        fetchPublicStats();
        startStatsPolling();
    }
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
