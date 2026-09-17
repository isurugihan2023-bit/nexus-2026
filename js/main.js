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

const GAME_THEMES = {
    "ceylon": { accent: "#10b981", glow: "rgba(16, 185, 129, 0.35)", border: "rgba(16, 185, 129, 0.5)", tag: "FiveM Roleplay", icon: "fa-car" },
    "dream creation": { accent: "#10b981", glow: "rgba(16, 185, 129, 0.35)", border: "rgba(16, 185, 129, 0.5)", tag: "FiveM Studio", icon: "fa-code" },
    "fivem": { accent: "#10b981", glow: "rgba(16, 185, 129, 0.35)", border: "rgba(16, 185, 129, 0.5)", tag: "FiveM Roleplay", icon: "fa-car" },
    "grand theft auto": { accent: "#10b981", glow: "rgba(16, 185, 129, 0.35)", border: "rgba(16, 185, 129, 0.5)", tag: "GTA V / FiveM", icon: "fa-car" },
    "gta": { accent: "#10b981", glow: "rgba(16, 185, 129, 0.35)", border: "rgba(16, 185, 129, 0.5)", tag: "GTA V / FiveM", icon: "fa-car" },
    "valorant": { accent: "#ff4655", glow: "rgba(255, 70, 85, 0.38)", border: "rgba(255, 70, 85, 0.55)", tag: "Tactical FPS", icon: "fa-crosshairs" },
    "pubg": { accent: "#f59e0b", glow: "rgba(245, 158, 11, 0.35)", border: "rgba(245, 158, 11, 0.5)", tag: "Battle Royale", icon: "fa-crosshairs" },
    "battlegrounds": { accent: "#f59e0b", glow: "rgba(245, 158, 11, 0.35)", border: "rgba(245, 158, 11, 0.5)", tag: "Battle Royale", icon: "fa-crosshairs" },
    "minecraft": { accent: "#22c55e", glow: "rgba(34, 197, 94, 0.35)", border: "rgba(34, 197, 94, 0.5)", tag: "Sandbox Survival", icon: "fa-cube" },
    "counter-strike": { accent: "#38bdf8", glow: "rgba(56, 189, 248, 0.35)", border: "rgba(56, 189, 248, 0.5)", tag: "Competitive FPS", icon: "fa-bullseye" },
    "cs2": { accent: "#38bdf8", glow: "rgba(56, 189, 248, 0.35)", border: "rgba(56, 189, 248, 0.5)", tag: "Competitive FPS", icon: "fa-bullseye" },
    "forza": { accent: "#ec4899", glow: "rgba(236, 72, 153, 0.35)", border: "rgba(236, 72, 153, 0.5)", tag: "Sim Racing", icon: "fa-flag-checkered" },
    "apex": { accent: "#ef4444", glow: "rgba(239, 68, 68, 0.35)", border: "rgba(239, 68, 68, 0.5)", tag: "Battle Royale", icon: "fa-shield-halved" },
    "roblox": { accent: "#ef4444", glow: "rgba(239, 68, 68, 0.35)", border: "rgba(239, 68, 68, 0.5)", tag: "Platform Sandbox", icon: "fa-shapes" },
    "red dead": { accent: "#dc2626", glow: "rgba(220, 38, 38, 0.35)", border: "rgba(220, 38, 38, 0.5)", tag: "Open World RPG", icon: "fa-hat-cowboy" },
    "rdr": { accent: "#dc2626", glow: "rgba(220, 38, 38, 0.35)", border: "rgba(220, 38, 38, 0.5)", tag: "Open World RPG", icon: "fa-hat-cowboy" },
    "cyberpunk": { accent: "#06b6d4", glow: "rgba(6, 182, 212, 0.35)", border: "rgba(6, 182, 212, 0.5)", tag: "Cyber RPG", icon: "fa-microchip" },
    "rust": { accent: "#ea580c", glow: "rgba(234, 88, 12, 0.35)", border: "rgba(234, 88, 12, 0.5)", tag: "Survival", icon: "fa-hammer" },
    "dota": { accent: "#f43f5e", glow: "rgba(244, 63, 94, 0.35)", border: "rgba(244, 63, 94, 0.5)", tag: "MOBA Strategy", icon: "fa-chess-knight" },
    "wukong": { accent: "#d97706", glow: "rgba(217, 119, 6, 0.35)", border: "rgba(217, 119, 6, 0.5)", tag: "Action RPG", icon: "fa-dragon" },
    "wuthering waves": { accent: "#6366f1", glow: "rgba(99, 102, 241, 0.35)", border: "rgba(99, 102, 241, 0.5)", tag: "Action RPG", icon: "fa-bolt" },
    "league of legends": { accent: "#eab308", glow: "rgba(234, 179, 8, 0.35)", border: "rgba(234, 179, 8, 0.5)", tag: "MOBA Arena", icon: "fa-shield" }
};

function getGameTheme(gameName) {
    if (!gameName) return { accent: "#a855f7", glow: "rgba(168, 85, 247, 0.35)", border: "rgba(168, 85, 247, 0.5)", tag: "Multiplayer", icon: "fa-gamepad" };
    const lower = gameName.toLowerCase();
    for (const [k, theme] of Object.entries(GAME_THEMES)) {
        if (lower.includes(k)) return theme;
    }
    return { accent: "#a855f7", glow: "rgba(168, 85, 247, 0.35)", border: "rgba(168, 85, 247, 0.5)", tag: "Live Gaming", icon: "fa-gamepad" };
}

const DEFAULT_COMMUNITY_GAMES = [
    {
        name: "Ceylon Roleplay",
        count: 1,
        is_live: true,
        sample_detail: "Players 69/100",
        players: ["Animo"],
        player_details: [
            { name: "Animo", avatar: "https://cdn.discordapp.com/avatars/1226896502216069130/14b1a6863a88ad6d3ae93635f51c387b.png?size=1024", details: "Players 69/100" }
        ],
        rich_cover: "https://cdn.discordapp.com/app-assets/945695523376103484/1065968155949797427.png"
    },
    {
        name: "DREAM CREATION STUDIO",
        count: 1,
        is_live: true,
        sample_detail: "TEAM DREAM CREATION STUDIO",
        players: ["! DINGDONG GAMING"],
        player_details: [
            { name: "! DINGDONG GAMING", avatar: "https://cdn.discordapp.com/avatars/857933823537971210/eb8f3018b0950eda1e2f326169ee0ea6.png?size=1024", details: "TEAM DREAM CREATION STUDIO" }
        ],
        rich_cover: "https://cdn.discordapp.com/app-assets/1438769318430117909/1489554874470367315.png"
    },
    {
        name: "PUBG: BATTLEGROUNDS",
        count: 1,
        is_live: true,
        sample_detail: "Normal, Taego, 28/97",
        players: ["PaMuJiThA"],
        player_details: [
            { name: "PaMuJiThA", avatar: "https://cdn.discordapp.com/avatars/703218404470816808/a_ad16d37e6320a308c084912daec3db22.gif?size=1024", details: "Normal, Taego, 28/97" }
        ],
        rich_cover: "https://cdn.discordapp.com/app-assets/530196305138417685/853805058045771786.png"
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
        return 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg';
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
        const isHot = (maxPlayers > 1 && count === maxPlayers) || (maxPlayers === 1 && idx === 0);

        const theme = getGameTheme(game.name);

        card.className = `game-card reveal visible ${isHot ? 'is-hot' : ''}`;
        card.style.setProperty('--game-accent', theme.accent);
        card.style.setProperty('--game-accent-glow', theme.glow);
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
        } else if (lowerDetail.includes('match') || lowerDetail.includes('5v5') || lowerDetail.includes('taego') || lowerDetail.includes('erangel')) {
            detailIcon = 'fa-crosshairs';
        }

        const liveBadgeHtml = isLive
            ? `<div class="game-live-badge"><span class="game-live-dot-pulse"></span> LIVE</div>`
            : `<div class="game-live-badge" style="color: #94a3b8; border-color: rgba(255,255,255,0.15);"><i class="fas fa-gamepad"></i> FEATURED</div>`;

        const hotBadgeHtml = isHot ? `<div class="game-hot-badge"><i class="fas fa-fire"></i> HOT</div>` : '';
        const countBadgeHtml = `<div class="game-player-badge"><i class="fas fa-users"></i> ${count} ${count === 1 ? 'In Session' : 'In Session'}</div>`;

        const playerDetails = game.player_details || (game.players ? game.players.map(p => ({ name: (typeof p === 'string' ? p : p.name), avatar: (p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'), details: matchDetail })) : []);
        const maxVisible = 4;
        const visiblePlayers = playerDetails.slice(0, maxVisible);
        const overflowCount = playerDetails.length - maxVisible;

        let avatarsHtml = '<div class="avatar-stack">';
        visiblePlayers.forEach(p => {
            const pName = typeof p === 'string' ? p : (p.name || 'Member');
            const avatarUrl = p.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            let detailStr = p.details ? escapeHtml(p.details) : 'Playing';
            if (detailStr.includes('???') || !detailStr.trim()) detailStr = 'In Session';

            avatarsHtml += `
                <div class="interactive-avatar-wrap">
                    <img src="${avatarUrl}" alt="${escapeHtml(pName)}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png';">
                    <div class="player-tooltip">
                        <span class="tooltip-name">${escapeHtml(pName)}</span>
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
                ${hotBadgeHtml}
                ${countBadgeHtml}
                <img src="${coverUrl}" alt="${escapeHtml(game.name)}" loading="lazy" onerror="this.src='https://images.igdb.com/igdb/image/upload/t_cover_big/co2mvt.jpg';">
            </div>
            <div class="game-card-body">
                <div class="game-genre-tag"><i class="fas ${theme.icon || 'fa-circle'}" style="font-size: 0.65rem;"></i> ${escapeHtml(theme.tag)}</div>
                <div class="game-name" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
                <div class="game-match-detail" title="${escapeHtml(matchDetail)}"><i class="fas ${detailIcon}"></i> ${escapeHtml(matchDetail)}</div>
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

    const squadCta = document.createElement('a');
    squadCta.href = 'https://discord.gg/fZNDG5sfhf';
    squadCta.target = '_blank';
    squadCta.className = 'squad-cta-card reveal visible';
    squadCta.innerHTML = `
        <div class="squad-cta-icon-wrap">
            <i class="fab fa-discord"></i>
        </div>
        <div class="squad-cta-title">Looking For Squad?</div>
        <div class="squad-cta-sub">Jump into Discord voice channels to squad up with community members right now.</div>
        <div class="squad-cta-btn">
            <i class="fas fa-headset"></i> Join Voice Squad
        </div>
    `;
    grid.appendChild(squadCta);
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
