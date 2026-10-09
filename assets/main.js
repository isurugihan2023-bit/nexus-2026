
        /* ── API base: same-origin ("") on the real site; absolute site URL
           when testing locally (Live Server has no /api/*). CORS is NOT
           loosened here: if the server allow-list blocks the localhost
           origin, requests fail into the normal offline state. */
        const API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
            ? 'https://ninjanexus.duckdns.org' : '';
        /* ── TeamSpeak Modal Handler ── */
        const tsModal = document.getElementById('teamspeak-modal');
        const tsCloseBtn = document.getElementById('ts-modal-close-btn');
        const tsBackdrop = document.getElementById('ts-backdrop-close');
        const tsCopyBtn = document.getElementById('ts-copy-btn');

        function openTsModal(e) {
            if (e) e.preventDefault();
            if (!tsModal) return;
            tsModal.classList.add('active');
            tsModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            document.body.classList.add('modal-open');
        }

        function closeTsModal() {
            if (!tsModal) return;
            tsModal.classList.remove('active');
            tsModal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            document.body.classList.remove('modal-open');
        }

        document.querySelectorAll('#hero-ts-connect-btn, #cta-ts-connect-btn, .ts-modal-trigger').forEach(btn => {
            btn.addEventListener('click', openTsModal);
        });
        if (tsCloseBtn) tsCloseBtn.addEventListener('click', closeTsModal);
        if (tsBackdrop) tsBackdrop.addEventListener('click', closeTsModal);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeTsModal();
        });

        if (tsCopyBtn) {
            tsCopyBtn.addEventListener('click', async () => {
                const ipText = '13.250.182.35';
                try {
                    await navigator.clipboard.writeText(ipText);
                } catch(err) {
                    const tempInput = document.createElement('input');
                    tempInput.value = ipText;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                }
                tsCopyBtn.classList.add('copied');
                const text = document.getElementById('ts-copy-text');
                if (text) text.textContent = 'Copied!';
                setTimeout(() => {
                    tsCopyBtn.classList.remove('copied');
                    if (text) text.textContent = 'Copy';
                }, 2000);
            });
        }
        // Ensure no stray dots exist in logo
        try {
            document.querySelectorAll('.nav-logo-dot').forEach(el => el.remove());
        } catch(e) {}
        /* ── Navbar scroll ── */
        const nav = document.getElementById('navbar');
        // ── Tab System ─────────────────────────────────────
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

            // Single source of truth for the nav highlight: the visible tab.
            // Footer anchor links route through showTab too, so they stay in sync.
            document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
            if (targetId !== 'home' && targetId !== 'home-cta') {
                const match = document.querySelector(`.nav-links a[href="#${targetId}"]`);
                if (match) match.classList.add('active');
            }

            // Footer is Home-only: hidden on every other tab (not just offscreen).
            const siteFooter = document.getElementById('site-footer');
            if (siteFooter) siteFooter.hidden = (targetId !== 'home');
            window.__nexusTab = targetId;

            // Keep URL + history in sync (no anchor jump) so back/forward
            // restores the tab — and therefore the footer — correctly.
            const wantHash = '#' + targetId;
            if (window.location.hash !== wantHash) history.pushState(null, '', wantHash);

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Nav link clicks (highlight is synced inside showTab)
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (!href || !href.startsWith('#')) return;
                e.preventDefault();
                showTab(href.substring(1));
            });
        });

        // Footer anchor links use the same tab switching so the nav
        // highlight never goes stale (external footer links untouched).
        document.querySelectorAll('#site-footer a[href^="#"]').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (!href || href.length < 2) return;
                e.preventDefault();
                showTab(href.substring(1));
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

        // Browser back/forward: restore the tab (and footer) from the URL hash.
        // showTab pushes one history entry per tab switch, so this only fires
        // for real history traversal (pushState itself fires no event).
        if (typeof window.__nexusTab === 'undefined') window.__nexusTab = 'home';
        window.addEventListener('hashchange', () => {
            const id = window.location.hash.substring(1);
            if (ALL_TABS.includes(id) && id !== window.__nexusTab) showTab(id);
        });

        /* ── Reveal on scroll (Staggered) ── */
        const observer = new IntersectionObserver((entries) => {
            let delay = 0;
            entries.forEach(e => { 
                if (e.isIntersecting) { 
                    setTimeout(() => e.target.classList.add('visible'), delay);
                    delay += 120;
                    observer.unobserve(e.target);
                } 
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        /* ── Command filters ── */
        const filterBtns = document.querySelectorAll('.cmd-filter');
        const categories = document.querySelectorAll('.cmd-category');
        const commandSearch = document.getElementById('cmd-search-input');
        const commandSearchClear = document.querySelector('.cmd-search-clear');
        const commandResultCount = document.getElementById('cmd-result-count');
        const commandEmptyState = document.getElementById('cmd-empty-state');
        const commandClearSearch = document.getElementById('cmd-clear-search');
        const commandCards = Array.from(document.querySelectorAll('.cmd-card')).map(card => {
            const name = card.querySelector('.cmd-card-name');
            const description = card.querySelector('.cmd-card-desc');
            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.className = 'cmd-copy';
            copyButton.setAttribute('aria-label', 'Copy command');
            copyButton.setAttribute('title', 'Copy command');
            copyButton.innerHTML = 'Copy<span class="cmd-sr-only" aria-live="polite"></span>';
            card.appendChild(copyButton);
            return {
                element: card,
                category: card.closest('.cmd-category'),
                searchText: `${name ? name.textContent : ''} ${description ? description.textContent : ''}`.toLowerCase(),
                commandText: name ? name.textContent.trim() : '',
                copyButton
            };
        });

        function fallbackCopyCommand(text) {
            const temporaryInput = document.createElement('textarea');
            temporaryInput.value = text;
            temporaryInput.setAttribute('readonly', '');
            temporaryInput.style.position = 'fixed';
            temporaryInput.style.opacity = '0';
            document.body.appendChild(temporaryInput);
            temporaryInput.select();
            let copied = false;
            try {
                copied = document.execCommand('copy');
            } finally {
                document.body.removeChild(temporaryInput);
            }
            return copied;
        }

        commandCards.forEach(({ commandText, copyButton }) => {
            copyButton.addEventListener('click', async () => {
                let copied = false;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(commandText);
                        copied = true;
                    }
                } catch (error) {
                    copied = false;
                }
                if (!copied) {
                    try {
                        copied = fallbackCopyCommand(commandText);
                    } catch (error) {
                        copied = false;
                    }
                }

                const announcement = copyButton.querySelector('.cmd-sr-only');
                if (copied) {
                    copyButton.classList.add('copied');
                    copyButton.firstChild.textContent = 'Copied';
                    if (announcement) announcement.textContent = `Copied ${commandText}`;
                    window.clearTimeout(copyButton.copyResetTimer);
                    copyButton.copyResetTimer = window.setTimeout(() => {
                        copyButton.classList.remove('copied');
                        copyButton.firstChild.textContent = 'Copy';
                        if (announcement) announcement.textContent = '';
                    }, 1500);
                } else if (announcement) {
                    announcement.textContent = 'Unable to copy command.';
                }
            });
        });

        function applyCommandFilters() {
            const activeFilter = document.querySelector('.cmd-filter.active');
            const selectedCategory = activeFilter ? activeFilter.dataset.filter : 'all';
            const query = commandSearch ? commandSearch.value.trim().toLowerCase() : '';
            let visibleCount = 0;

            categories.forEach(category => {
                const inSelectedCategory = selectedCategory === 'all' || category.dataset.cat === selectedCategory;
                let visibleInCategory = 0;
                commandCards.forEach(command => {
                    if (command.category !== category) return;
                    const matches = inSelectedCategory && (!query || command.searchText.includes(query));
                    command.element.classList.toggle('hidden', !matches);
                    if (matches) {
                        visibleInCategory += 1;
                        visibleCount += 1;
                    }
                });
                category.classList.toggle('hidden', visibleInCategory === 0);
            });

            if (commandResultCount) {
                commandResultCount.textContent = `${visibleCount} ${visibleCount === 1 ? 'command' : 'commands'}`;
            }
            if (commandEmptyState) commandEmptyState.classList.toggle('hidden', visibleCount > 0);
            if (commandSearchClear) {
                commandSearchClear.classList.toggle('visible', Boolean(query));
                commandSearchClear.setAttribute('aria-hidden', String(!query));
            }
        }

        let commandSearchTimer;
        if (commandSearch) {
            commandSearch.addEventListener('input', () => {
                window.clearTimeout(commandSearchTimer);
                if (commandSearchClear) {
                    const hasQuery = Boolean(commandSearch.value.trim());
                    commandSearchClear.classList.toggle('visible', hasQuery);
                    commandSearchClear.setAttribute('aria-hidden', String(!hasQuery));
                }
                commandSearchTimer = window.setTimeout(applyCommandFilters, 120);
            });
            commandSearch.addEventListener('keydown', event => {
                if (event.key === 'Escape' && commandSearch.value) {
                    event.preventDefault();
                    commandSearch.value = '';
                    window.clearTimeout(commandSearchTimer);
                    applyCommandFilters();
                }
            });
        }
        function clearCommandSearch() {
            if (!commandSearch) return;
            commandSearch.value = '';
            window.clearTimeout(commandSearchTimer);
            applyCommandFilters();
            commandSearch.focus();
        }
        if (commandSearchClear) commandSearchClear.addEventListener('click', clearCommandSearch);
        if (commandClearSearch) commandClearSearch.addEventListener('click', clearCommandSearch);

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyCommandFilters();
                btn.scrollIntoView({
                    inline: 'center',
                    block: 'nearest',
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'instant' : 'smooth'
                });
            });
        });
        applyCommandFilters();

        /* ── Live stats from Discord & Bot API ── */
        let currentNinjaNexusMembers = null;
        const dpTexts = document.querySelectorAll('.dp-dynamic-text');
        const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;

        function updateMemberDisplays(count) {
            if (!Number.isFinite(count) || count <= 0) return;
            currentNinjaNexusMembers = count;
            const hm = document.getElementById('hero-members');
            const am = document.getElementById('about-users');
            const uc = document.getElementById('user-count-stat');
            if (hm) {
                hm.textContent = fmt(count);
                hm.classList.remove('stat-loading');
            }
            if (am) am.textContent = fmt(count);
            if (uc) {
                uc.textContent = fmt(count);
                uc.classList.remove('stat-loading');
            }
        }

        function updateOnlineDisplays(count) {
            const hero = document.getElementById('hero-online');
            const onlineDisplays = [
                document.getElementById('online-now-stat'),
                document.getElementById('about-online-stat')
            ].filter(Boolean);
            if (!Number.isInteger(count) || count < 0) {
                if (hero) {
                    hero.textContent = '–';
                    hero.classList.remove('stat-loading');
                }
                onlineDisplays.forEach(el => {
                    el.textContent = '–';
                    el.classList.remove('stat-loading');
                });
                return;
            }
            const formattedCount = fmt(count);
            if (hero) {
                hero.textContent = formattedCount;
                hero.classList.remove('stat-loading');
            }
            onlineDisplays.forEach(el => {
                el.textContent = formattedCount;
                el.classList.remove('stat-loading');
            });
            dpTexts.forEach(el => { el.textContent = `${fmt(count)} ONLINE`; });
        }

        function updateServerStatStrip(count) {
            if (!Number.isFinite(count) || count <= 0) return;
            const strip = document.getElementById('server-count-stat');
            if (strip) strip.textContent = String(count);
        }

        // ── LIVE GAMES LOUNGE ENGINE ─────────────────────────
        // Covers are LOCAL-FIRST: bot-provided absolute image URLs are never
        // used (the old same-origin /static/* URLs hang for 20s+, and any
        // http:// URL is blocked as mixed content on this HTTPS page).
        // Chain per card: images/games/<game_key>.jpg → category art
        // (shipped cat-*.svg) → generic fallback. Never a blank box.
        const LOCAL_FALLBACK_COVER = 'images/games/fallback.svg';
        const CATEGORY_ART = [
            [/fivem|roleplay|gta|ceylon/i, 'images/games/cat-fivem.svg'],
            [/tactical|fps|shooter|cod|call of duty|overwatch/i, 'images/games/cat-tactical-fps.svg'],
            [/battle royale|battlegrounds|pubg|fortnite|warzone|apex/i, 'images/games/cat-battle-royale.svg'],
            [/platform|fighter|brawl/i, 'images/games/cat-platform.svg'],
            [/rac|f1|formula|forza|driving/i, 'images/games/cat-racing.svg'],
            [/moba|strategy|dota|league of legends/i, 'images/games/cat-moba.svg'],
            [/action|wuther|wukong|rpg|adventure|genshin/i, 'images/games/cat-action-rpg.svg'],
            [/sandbox|survival|craft|rust|minecraft|roblox/i, 'images/games/cat-sandbox.svg'],
            [/sport|football|fifa|rocket league/i, 'images/games/cat-sports.svg']
        ];
        function slugOf(name) {
            return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        }
        function categoryArt(category, name) {
            const hay = `${category || ''} ${name || ''}`;
            for (const [re, art] of CATEGORY_ART) {
                if (re.test(hay)) return art;
            }
            return LOCAL_FALLBACK_COVER;
        }
        // A relative website path is safe to use; anything absolute is not.
        function isLocalPath(url) {
            const u = (url || '').trim();
            if (!u) return false;
            return !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//');
        }
        function isGenericCover(url) {
            const u = (url || '').trim().toLowerCase();
            return u === '' || u.endsWith('fallback.svg') || u.endsWith('fallback.jpg');
        }

        const GAME_METADATA = {
            "wallpaper engine": { tag: "Utility" },
            "wallpaper": { tag: "Utility" },
            "brawlhalla": { tag: "Platform Fighter" },
            "visual studio code": { tag: "Development" },
            "vscode": { tag: "Development" },
            "ceylon": { tag: "FiveM Roleplay" },
            "dream creation": { tag: "FiveM Studio" },
            "fivem": { tag: "FiveM Roleplay" },
            "grand theft auto": { tag: "GTA V / FiveM" },
            "gta": { tag: "GTA V / FiveM" },
            "valorant": { tag: "Tactical FPS" },
            "pubg": { tag: "Battle Royale" },
            "battlegrounds": { tag: "Battle Royale" },
            "minecraft": { tag: "Sandbox Survival" },
            "counter-strike": { tag: "Competitive FPS" },
            "cs2": { tag: "Competitive FPS" },
            "forza": { tag: "Sim Racing" },
            "apex": { tag: "Battle Royale" },
            "roblox": { tag: "Platform Sandbox" },
            "red dead": { tag: "Open World RPG" },
            "rdr": { tag: "Open World RPG" },
            "cyberpunk": { tag: "Cyber RPG" },
            "rust": { tag: "Survival" },
            "dota": { tag: "MOBA Strategy" },
            "wukong": { tag: "Action RPG" },
            "wuthering waves": { tag: "Action RPG" },
            "league of legends": { tag: "MOBA Arena" },
            "arc raiders": { tag: "Extraction Shooter" },
            "arc": { tag: "Extraction Shooter" },
            "fortnite": { tag: "Battle Royale" },
            "f1": { tag: "Racing" },
            "formula 1": { tag: "Racing" },
            "call of duty": { tag: "Tactical FPS" },
            "cod": { tag: "Tactical FPS" },
            "warzone": { tag: "Battle Royale" },
            "overwatch": { tag: "Tactical FPS" },
            "fifa": { tag: "Sports" },
            "ea sports fc": { tag: "Sports" },
            "rocket league": { tag: "Sports" }
        };

        const GENERIC_TAGS = ["", "gaming", "live gaming", "unknown", "other", "app"];
        function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        function gameKeyMatch(lower, k) {
            // Word-boundary match: "cod" must not fire inside "code"
            // (VS Code was mislabeled TACTICAL FPS). "CoD" still matches.
            try {
                return new RegExp('\\b' + escRe(k) + '\\b', 'i').test(lower);
            } catch (e) {
                return lower.includes(k);
            }
        }
        function getGameTheme(gameName, categoryOverride) {
            // A specific API category wins. A generic one ("Other"/"Gaming" —
            // sent for unknown apps or by older bot builds without metadata)
            // is treated as no opinion so the local name lookup still yields
            // the real label. Unknown apps keep "Other" + generic
            // cover, never a real game's category.
            const override = (categoryOverride && String(categoryOverride).trim()) || "";
            let tag = override;
            let tagFromApi = override !== "" && !GENERIC_TAGS.includes(override.toLowerCase());
            if (!tagFromApi) tag = "Other";
            if (gameName) {
                const lower = gameName.toLowerCase();
                for (const [k, meta] of Object.entries(GAME_METADATA)) {
                    if (gameKeyMatch(lower, k)) {
                        if (!tagFromApi) tag = meta.tag;
                        break;
                    }
                }
            }
            return {
                accent: "#C6E32B",
                border: "rgba(198, 227, 43, 0.35)",
                tag: tag
            };
        }

        const DEFAULT_COMMUNITY_GAMES = [];

        // ── Phase 5: Typical squad sizes per game ──
        const TYPICAL_SQUAD_SIZES = {
            "valorant": 5, "pubg": 4, "battlegrounds": 4, "counter-strike": 5, "cs2": 5,
            "apex": 3, "rocket league": 3, "fortnite": 4, "brawlhalla": 2, "dota": 5,
            "league of legends": 5, "rust": 4, "arc raiders": 3, "arc": 3, "r6": 5, "rainbow six": 5
        };

        // Resolve one game to its cover chain (ordered URLs, first hit wins).
        // Chain: manual images/games/<game_key>.jpg (or the key guess when
        //   the payload carries no usable image) -> same-origin bot-cover
        //   proxy /api/cover?slug=<game_key> -> local auto/<game_key>.jpg
        //   (or its guess) -> images/games/default.jpg -> generic robot art.
        // Every historic step is preserved (offline curated drop-ins still
        // resolve locally with zero bot dependency); the proxy is the only
        // addition. A proxy miss 302s to the placeholder (same bytes as
        // default.jpg), so the card never hangs on it.
        // Bot-provided absolute URLs are ignored on purpose (hang/mixed),
        // a bot /api/public/cover/... path is converted to the proxy form
        // (Vercel never serves the bot prefix), and legacy category art
        // (cat-*.svg) is never used as a cover - the genre label on the
        // card is text and stays untouched.
        function pickCover(game) {
            const g = game || {};
            const name = g.name || g.game_name || '';
            const key = slugOf(g.game_key || name) || 'game';
            const proxy = '/api/cover?slug=' + key;
            let rawImage = String(g.image || '').trim();
            let fbOverride = '';
            if (rawImage.indexOf('/api/public/cover/') === 0) {
                // Never emit the bot prefix - convert to proxy form and
                // keep the bot's fallback when it is a local path.
                rawImage = '';
                if (isLocalPath(g.fallback)) fbOverride = g.fallback.split('?')[0];
            }
            const relRaw = (isLocalPath(rawImage) && !isGenericCover(rawImage)) ? rawImage.split('?')[0] : '';
            const rel = (relRaw && relRaw.indexOf('/cat-') === -1) ? relRaw : '';
            const autoGiven = g.auto_image || g.auto || '';
            const autoRel = (isLocalPath(autoGiven) && !isGenericCover(autoGiven)) ? autoGiven.split('?')[0] : '';
            const keyGuess = `images/games/${key}.jpg?v=2`;
            const autoGuess = `images/games/auto/${key}.jpg?v=2`;
            const secondaryBase = fbOverride || 'images/games/default.jpg';
            const secondary = secondaryBase + (secondaryBase.indexOf('?') === -1 ? '?v=2' : '');
            // Ordered, deduped steps. `auto` may hold several '|'-joined
            // URLs - coverStep splits them back apart.
            const steps = [];
            const pushStep = (u) => { if (u && steps.indexOf(u) === -1) steps.push(u); };
            if (fbOverride) {
                pushStep(proxy);
                pushStep(keyGuess);
            } else if (rel) {
                pushStep(rel + '?v=2');
                pushStep(proxy);
            } else {
                pushStep(keyGuess);
                pushStep(proxy);
            }
            pushStep(autoRel ? autoRel + '?v=2' : autoGuess);
            pushStep(secondary);
            return {
                primary: steps[0],
                auto: steps.slice(1, -1).join('|'),
                secondary: steps[steps.length - 1],
                name
            };
        }
        // Ordered chain (deduped): manual -> captured auto/ -> category.
        // The robot fallback terminates the chain in coverStep.
        function coverChain(game) {
            const picked = pickCover(game);
            return [picked.primary, picked.auto, picked.secondary]
                .filter((u, i, a) => u && a.indexOf(u) === i);
        }
        // Captured square logos render contain-fit over a darkened blurred
        // copy of themselves (CSS .is-auto-art); card box never changes.
        function markAutoArt(img, url) {
            img.classList.add('is-auto-art');
            const wrap = img.closest('.game-card-img-wrap,.modal-banner');
            if (wrap) {
                wrap.classList.add('has-auto-art');
                wrap.style.setProperty('--auto-bg', 'url("' + url + '")');
            }
        }
        function resetAutoArt(img) {
            img.classList.remove('is-auto-art');
            const wrap = img.closest('.game-card-img-wrap,.modal-banner');
            if (wrap) {
                wrap.classList.remove('has-auto-art');
                wrap.style.removeProperty('--auto-bg');
            }
        }
        // Self-clearing chain stepper: each error advances one URL, the end
        // falls back to the robot art. Shared by cards and the modal.
        function coverStep(img) {
            const next = (img.dataset.next || '').split('|').filter(Boolean);
            if (!next.length) {
                img.onerror = null;
                img.src = LOCAL_FALLBACK_COVER;
                return;
            }
            const url = next.shift();
            img.dataset.next = next.join('|');
            if (url.indexOf('/auto/') !== -1) markAutoArt(img, url);
            else resetAutoArt(img);
            img.src = url;
        }
        function coverImgHtml(game, alt) {
            const chain = coverChain(game);
            return `<img src="${chain[0]}" alt="${alt}" width="350" height="175" loading="lazy" decoding="async" data-next="${chain.slice(1).join('|')}" onerror="coverStep(this)">`;
        }
        function getGameImageUrl(game) {
            return pickCover(typeof game === 'string' ? { name: game } : game).primary;
        }

        function renderEmptyLoungeState() {
            return `
                <div class="empty-lounge-state">
                    <div class="empty-lounge-box">
                        <h3 class="empty-lounge-title">No one is playing right now, be the first!</h3>
                        <p class="empty-lounge-sub">Start a game on Discord or join a voice lounge to have your session featured live here.</p>
                        <div class="empty-lounge-actions">
                            <a href="https://discord.gg/fZNDG5sfhf" target="_blank" rel="noopener noreferrer" class="empty-lounge-discord-btn">Join Discord</a>
                        </div>
                    </div>
                </div>
            `;
        }

        function renderOfflineLoungeState() {
            return `
                <div class="empty-lounge-state" data-lounge-offline="true">
                    <div class="empty-lounge-box">
                        <h3 class="empty-lounge-title">Live feed is offline, try again soon.</h3>
                        <p class="empty-lounge-sub">Could not reach the live server. Check back shortly.</p>
                        <div class="empty-lounge-actions">
                            <a href="https://discord.gg/fZNDG5sfhf" target="_blank" rel="noopener noreferrer" class="empty-lounge-discord-btn">Join Discord</a>
                        </div>
                    </div>
                </div>
            `;
        }

        function showOfflineLounge() {
            const grid = document.getElementById('live-games-grid');
            if (!grid) return;
            window.hasRenderedLiveGames = true;
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
            if (lastGamesDigest === 'OFFLINE' && grid.querySelector('[data-lounge-offline]')) {
                return;
            }
            lastGamesDigest = 'OFFLINE';
            grid.innerHTML = renderOfflineLoungeState();
        }

        let lastGamesDigest = '';
        window.currentLiveGamesState = [];

        function avatar64(url) {
            const u = (url || '').trim() || 'https://cdn.discordapp.com/embed/avatars/0.png';
            if (u.includes('cdn.discordapp.com')) return u.split('?')[0] + '?size=64';
            return u;
        }

        function initialsOf(name) {
            const parts = String(name || 'Member').trim().split(/\s+/).filter(Boolean);
            if (parts.length === 0) return 'M';
            const first = (parts[0][0] || 'M').toUpperCase();
            const last = parts.length > 1 ? (parts[parts.length - 1][0] || '').toUpperCase() : '';
            return escapeHtml((first + last).slice(0, 2) || 'M');
        }

        // Player objects are validated, never dropped: a missing name becomes
        // "Member", a missing/broken avatar reveals styled initials, a missing
        // detail line is hidden (not blank). Photos are lazy, size=64 on the
        // Discord CDN, no-referrer, with a self-clearing error handler.
        function avatarImgHtml(pName, rawAvatar, detailStr, size) {
            const safeName = (typeof pName === 'string' && pName.trim()) ? pName : 'Member';
            const avatarUrl = avatar64(rawAvatar || '');
            const tip = (detailStr && detailStr.trim() && !detailStr.includes('???'))
                ? `${safeName} - ${detailStr}`
                : safeName;
            const cls = size === 40 ? 'avatar-ph modal-avatar-ph' : 'avatar-ph';
            return `<span class="${cls}"><span aria-hidden="true">${initialsOf(safeName)}</span>` +
                `<img src="${avatarUrl}" alt="${escapeHtml(safeName)}" title="${escapeHtml(tip)}" ` +
                `loading="lazy" decoding="async" width="${size}" height="${size}" referrerpolicy="no-referrer" ` +
                `onerror="this.onerror=null;this.style.display='none';"></span>`;
        }

        // Normalize the new public API shape
        // {game_key,name,category,image,server_players,players:[{name,avatar,details,state,since}],player_count}
        // to the legacy card shape. Drops entries without a real game name.
        function normalizeLiveGames(gamesList) {
            if (!Array.isArray(gamesList)) return [];
            return gamesList
                .filter((g) => g && (g.name || g.game_key))
                .map((g) => {
                    const name = g.name || g.game_key;
                    const players = Array.isArray(g.players)
                        ? g.players
                        : (Array.isArray(g.player_details) ? g.player_details : (g.players || []));
                    const details = (g.player_details && g.player_details.length > 0)
                        ? g.player_details
                        : players.map((p) => (typeof p === 'string'
                            ? { name: p, avatar: '', details: '', since: 0 }
                            : {
                                name: p.name || 'Member',
                                avatar: avatar64(p.avatar || ''),
                                details: p.details || '',
                                state: p.state || '',
                                start_timestamp: p.since || 0
                            }));
                    const count = g.player_count || g.count || details.length || 1;
                    let sample = g.sample_detail || '';
                    if (g.server_players && g.server_players.current !== undefined) {
                        sample = `Players ${g.server_players.current}/${g.server_players.max || 100}`;
                    }
                    if (!sample && details[0]) sample = details[0].details || '';
                    // NOTE: only display-safe fields are kept here. Member IDs
                    // (player_id/id) are deliberately dropped — never rendered.
                    const cover = pickCover({ game_key: g.game_key, name, category: g.category });
                    return {
                        name, count,
                        game_key: g.game_key || slugOf(name),
                        players: details.map((p) => p.name),
                        player_details: details,
                        sample_detail: sample,
                        category: g.category || '',
                        image: cover.primary,
                        fallback: cover.secondary,
                        rich_cover: null
                    };
                })
                .filter((g) => g.player_details.length > 0);
        }

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
                if (lastGamesDigest === 'EMPTY' && grid.querySelector('.empty-lounge-state')) {
                    return;
                }
                lastGamesDigest = 'EMPTY';
                grid.innerHTML = renderEmptyLoungeState();
                return;
            }

            const games = normalizeLiveGames(gamesList);
            if (games.length === 0 && Array.isArray(gamesList) && gamesList.length > 0) {
                return; // payload with no usable game rows: keep current cards
            }
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
            const count = game.player_count || game.count || (game.players ? game.players.length : 1);
                const isLive = true;
                const isHot = maxPlayers >= 2 && count === maxPlayers;

                const theme = getGameTheme(game.name, game.category);

                card.className = `game-card reveal visible ${isHot ? 'is-hot' : ''}`;
                card.setAttribute('data-game-name', game.name);
                card.style.setProperty('--game-accent', theme.accent);
                card.style.setProperty('--game-accent-border', theme.border);

                let rawDetail = game.sample_detail || (game.player_details && game.player_details[0] && game.player_details[0].details) || '';
                if (rawDetail.includes('???')) rawDetail = '';
                rawDetail = rawDetail.trim();
                const matchDetail = rawDetail;

                const matchDetailHtml = matchDetail
                    ? `<div class="game-match-detail" title="${escapeHtml(matchDetail)}">${escapeHtml(matchDetail)}</div>`
                    : '';


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
                    const rawAvatar = typeof p === 'string' ? '' : (p.avatar || '');
                    let detailStr = (typeof p !== 'string' && p.details) ? p.details : 'Playing';
                    if (detailStr.includes('???') || !detailStr.trim()) detailStr = 'In Session';

                    avatarsHtml += avatarImgHtml(pName, rawAvatar, detailStr, 26);
                });
                if (overflowCount > 0) {
                    avatarsHtml += `<div class="avatar-overflow">+${overflowCount}</div>`;
                }
                avatarsHtml += '</div>';

                const coverUrl = getGameImageUrl(game);

                card.innerHTML = `
                    <div class="game-card-img-wrap">
                        ${coverImgHtml(game, escapeHtml(game.name))}
                    </div>
                    <div class="game-card-body">
                        <div class="game-genre-tag">${escapeHtml(theme.tag)}</div>
                        <div class="game-name" title="${escapeHtml(game.name)}">${escapeHtml(game.name)}</div>
                        ${matchDetailHtml}
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

        // ── GAME SESSION MODAL LOGIC ─────────────────────────
        const gameModal = document.getElementById('game-session-modal');
        const modalCloseBtn = document.getElementById('modal-close-btn');
        const modalBackdrop = document.getElementById('modal-backdrop-close');

        function openGameModal(game, coverUrl, matchDetail) {
            if (!gameModal) return;
            const coverEl = document.getElementById('modal-game-cover');
            const titleEl = document.getElementById('modal-game-title');
            const countEl = document.getElementById('modal-game-count');
            const listEl = document.getElementById('modal-players-list');

            const count = game.player_count || game.count || (game.players ? game.players.length : 1);
            if (coverEl) {
                const chain = coverChain(game);
                resetAutoArt(coverEl);
                coverEl.onerror = function () { coverStep(coverEl); };
                coverEl.dataset.next = chain.slice(1).join('|');
                coverEl.src = coverUrl || chain[0];
                if ((coverUrl || chain[0]).indexOf('/auto/') !== -1) {
                    markAutoArt(coverEl, coverUrl || chain[0]);
                }
            }
            if (titleEl) titleEl.textContent = game.name;
            if (countEl) countEl.textContent = `${count} ${count === 1 ? 'Member' : 'Members'} Active in Session`;

            const players = game.player_details || (game.players ? game.players.map(p => ({ name: p, avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', details: matchDetail })) : []);

            if (listEl) {
                listEl.innerHTML = '';
                players.forEach(p => {
                    const pName = typeof p === 'string' ? p : (p.name || 'Member');
                    const rawAvatar = typeof p === 'string' ? '' : (p.avatar || '');
                    let rawPDetail = (typeof p !== 'string' && p.details) ? String(p.details) : '';
                    if (rawPDetail.includes('???')) rawPDetail = '';
                    rawPDetail = rawPDetail.trim();
                    const detailHtml = rawPDetail
                        ? `<div class="modal-player-detail">${escapeHtml(rawPDetail)}</div>`
                        : '';

                    const startTime = (p.start_timestamp ? (p.start_timestamp > 1e11 ? p.start_timestamp : p.start_timestamp * 1000) : null) ||
                                      (p.timestamps && p.timestamps.start ? (p.timestamps.start > 1e11 ? p.timestamps.start : p.timestamps.start * 1000) : null) ||
                                      (p.created_at ? new Date(p.created_at).getTime() : null);

                    const timeBadgeHtml = startTime ? `
                        <div class="modal-activity-time" data-start="${startTime}">
                            <span class="time-text">${formatElapsedTime(startTime)}</span>
                        </div>
                    ` : '';

                    const item = document.createElement('div');
                    item.className = 'modal-player-item';
                    item.innerHTML = `
                        ${avatarImgHtml(pName, rawAvatar, rawPDetail, 40)}
                        <div class="modal-player-info">
                            <div class="modal-player-name">${escapeHtml(pName)}</div>
                            ${detailHtml}
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
            document.body.classList.add('modal-open');
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
            document.body.classList.remove('modal-open');
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
                text.textContent = 'Live Sync (10s Interval)';
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

                // Auto-discovery: browsers NEVER dial the bot directly
                // (plain-HTTP bot vs HTTPS site = mixed content + IP leak).
                // Live updates come from same-origin /api/public/live +
                // /api/public/live/stream (server-side resolver). Direct WS
                // is opt-in only via window.NEXUS_WS_URL.
                this.url = window.NEXUS_WS_URL || null;
            }

            connect() {
                if (this.isExplicitlyPaused) return;

                if (!this.url) {
                    this.engageFallbackPolling();
                    return;
                }

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
                        console.warn('[NEXUS Live] WebSocket error encountered. Falling back to REST polling.');
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
                        // Name-only matching: member IDs are never stored or
                        // rendered (privacy — no IDs in markup, ever).
                        const pName = player.username || player.name;
                        gameObj.player_details = (gameObj.player_details || []).filter(p => p.name !== pName);
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
                        const existing = gameObj.player_details.find(p => p.name === (player.username || player.name));
                        if (existing) {
                            existing.details = player.details;
                        }
                    }
                } else if (action === 'GAME_ENDED') {
                    games = games.filter(g => g.name.toLowerCase() !== game.toLowerCase());
                    renderLiveGames(games);
                    return;
                }

                // Targeted DOM patch
                const grid = document.getElementById('live-games-grid');
                if (grid && gameObj) {
                    const card = grid.querySelector(`.game-card[data-game-name="${CSS.escape(gameObj.name)}"]`);
                    if (card) {
                        const headline = card.querySelector('.game-player-headline .game-player-name');
                        if (headline && gameObj.players.length > 0) {
                            headline.textContent = gameObj.players.length === 1
                                ? gameObj.players[0]
                                : (gameObj.players.length === 2 ? `${gameObj.players[0]} & ${gameObj.players[1]}` : `${gameObj.players[0]} +${gameObj.players.length - 1} others`);
                        }
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
                    // The 10s live loop already runs (startLiveLoop); never
                    // start a second one — that would double every request.
                    if (typeof liveInterval === 'undefined' || !liveInterval) {
                        startStatsPolling();
                    }
                    updateSyncStatus('polling');
                }
            }

            scheduleReconnect() {
                if (this.isExplicitlyPaused || this.reconnectTimer) return;
                // The dead-WS host is retried a few times, then polling owns
                // updates for the rest of the page view (no endless loop).
                if (this.reconnectAttempts >= 5) return;
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

        // ── Live Sessions: REAL data only (no mock/fallback games) ──
        // Same-origin API (no mixed content on HTTPS). First paint comes
        // from the last cached JSON instantly (marked updating) or from a
        // skeleton when there is no cache; the network only refreshes.
        const LIVE_API_URL = API_BASE + '/api/public/live';
        const LIVE_STREAM_URL = API_BASE + '/api/public/live/stream';
        const LIVE_CACHE_KEY = 'nexus-live-cache-v1';
        const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
        let liveGen = 0;
        let liveBackoffMs = 0;
        let liveConsecFails = 0;
        let liveRetryAt = 0;
        let liveRetryTimer = null;
        let liveRequestInFlight = false;
        let liveSse = null;
        let liveSseReconnectTimer = null;
        let liveSseConnectTimer = null;
        let liveSseBackoffMs = 5000;
        let liveLastUpdatedAt = 0;
        let liveUpdating = false;

        function readLiveCache() {
            try {
                const c = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY));
                if (c && Array.isArray(c.games) && typeof c.at === 'number') {
                    if (Date.now() - c.at < LIVE_CACHE_TTL_MS) return c;
                }
            } catch (e) {}
            return null;
        }
        function writeLiveCache(games) {
            try { localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify({ games, at: Date.now() })); } catch (e) {}
        }
        function fmtAgo(ms) {
            const s = Math.max(0, Math.round(ms / 1000));
            if (s < 5) return 'just now';
            if (s < 60) return `${s}s ago`;
            const m = Math.floor(s / 60);
            if (m < 60) return `${m}m ago`;
            return `${Math.floor(m / 60)}h ago`;
        }
        const SHOW_LOUNGE_UPDATED = false;
        function paintUpdated() {
            const el = document.getElementById('lounge-updated');
            if (!el) return;
            el.hidden = !SHOW_LOUNGE_UPDATED;
            el.setAttribute('aria-hidden', String(!SHOW_LOUNGE_UPDATED));
            if (!SHOW_LOUNGE_UPDATED) return;
            if (!liveLastUpdatedAt) {
                el.textContent = liveUpdating ? 'Updating…' : '';
                return;
            }
            el.textContent = liveUpdating
                ? `Updating… (last update ${fmtAgo(Date.now() - liveLastUpdatedAt)})`
                : `Updated ${fmtAgo(Date.now() - liveLastUpdatedAt)}`;
        }
        setInterval(paintUpdated, 5000);

        function renderLiveSkeleton() {
            const grid = document.getElementById('live-games-grid');
            if (!grid || window.hasRenderedLiveGames) return;
            grid.innerHTML = '<div class="live-games-grid">'
                + '<div class="skeleton-card" aria-hidden="true"></div>'
                + '<div class="skeleton-card" aria-hidden="true"></div>'
                + '<div class="skeleton-card" aria-hidden="true"></div>'
                + '</div>';
        }

        function pulseCount(el) {
            try {
                if (el && el.animate) {
                    el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
                }
            } catch (e) {}
        }

        function setLiveLoadError(visible) {
            const status = document.getElementById('live-load-error');
            if (status) status.hidden = !visible;
        }

        function scheduleLiveRetry(gen) {
            liveBackoffMs = Math.min(60000, liveBackoffMs
                ? liveBackoffMs * 2 : 5000);
            liveRetryAt = Date.now() + liveBackoffMs;
            if (liveRetryTimer) clearTimeout(liveRetryTimer);
            liveRetryTimer = setTimeout(() => {
                liveRetryTimer = null;
                if (gen === liveGen && !document.hidden) {
                    liveRetryAt = 0;
                    fetchLiveGames();
                }
            }, liveBackoffMs);
        }

        function retryLiveNow() {
            if (liveRetryTimer) clearTimeout(liveRetryTimer);
            liveRetryTimer = null;
            liveRetryAt = 0;
            liveBackoffMs = 0;
            fetchLiveGames();
            if (!liveSse) tryLiveSSE();
        }

        async function fetchJson(url, timeoutMs) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const r = await fetch(url, { signal: controller.signal, cache: 'no-store' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return await r.json();
            } finally {
                clearTimeout(timeoutId);
            }
        }

        async function fetchLiveGames() {
            if (liveRequestInFlight || Date.now() < liveRetryAt) return;
            const gen = ++liveGen;
            liveRequestInFlight = true;
            liveUpdating = true;
            paintUpdated();
            try {
                const data = await fetchJson(LIVE_API_URL + '?_t=' + Date.now(), 5000);
                if (gen !== liveGen) return; // superseded: single loop only
                if (!data || !Array.isArray(data.games)) {
                    throw new Error('Invalid live response');
                }
                const games = data.games;
                if (data.stale === true) {
                    // A populated stale response is still useful when no
                    // client-side good copy exists; never treat stale-empty
                    // (or a refresh failure) as a real empty result.
                    if (games.length > 0
                            && (window.currentLiveGamesState || []).length === 0) {
                        renderLiveGames(games);
                        liveLastUpdatedAt = Number(data.generated_at) || Date.now();
                    }
                    setLiveLoadError(true);
                    scheduleLiveRetry(gen);
                    return;
                }
                liveBackoffMs = 0;
                liveRetryAt = 0;
                if (liveRetryTimer) clearTimeout(liveRetryTimer);
                liveRetryTimer = null;
                liveConsecFails = 0;
                setLiveLoadError(false);
                const prevTotal = (window.currentLiveGamesState || []).reduce(
                    (a, g) => a + (g.count || (g.players ? g.players.length : 0)), 0);
                renderLiveGames(games);
                const totalEl = document.getElementById('lounge-total-players');
                const nowTotal = games.reduce(
                    (a, g) => a + (g.player_count || g.count || (g.players ? g.players.length : 0)), 0);
                if (totalEl && nowTotal !== prevTotal) pulseCount(totalEl);
                updateLoungeStats(undefined, undefined, nowTotal);
                liveLastUpdatedAt = Date.now();
                writeLiveCache(games);
            } catch (err) {
                if (gen !== liveGen) return;
                liveConsecFails++;
                setLiveLoadError(true);
                scheduleLiveRetry(gen);
            } finally {
                if (gen === liveGen) liveUpdating = false;
                liveRequestInFlight = false;
                paintUpdated();
            }
        }

        // SSE is update-only and never blocks rendering: the first paint
        // always comes from plain JSON (cache, then fetchLiveGames above).
        // The SSE relay reconnects with backoff; independent JSON polling
        // continues every 10s and remains the recovery path.
        function tryLiveSSE() {
            if (liveSse || liveSseReconnectTimer || typeof EventSource === 'undefined') return;
            try {
                const es = new EventSource(LIVE_STREAM_URL);
                liveSse = es;
                liveSseConnectTimer = setTimeout(() => {
                    if (es.readyState !== 1 && liveSse === es) {
                        try { es.close(); } catch (e) {}
                        liveSse = null;
                        scheduleLiveSseReconnect();
                    }
                }, 3000);
                es.onopen = () => {
                    if (liveSseConnectTimer) clearTimeout(liveSseConnectTimer);
                    liveSseConnectTimer = null;
                    setTimeout(() => {
                        if (liveSse === es) liveSseBackoffMs = 5000;
                    }, 30000);
                };
                es.onmessage = (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (data && Array.isArray(data.games)
                                && data.stale !== true) {
                            liveLastUpdatedAt = Date.now();
                            renderLiveGames(data.games);
                            writeLiveCache(data.games);
                            liveRetryAt = 0;
                            if (liveRetryTimer) clearTimeout(liveRetryTimer);
                            liveRetryTimer = null;
                            liveBackoffMs = 0;
                            setLiveLoadError(false);
                            paintUpdated();
                        }
                    } catch (e) {}
                };
                es.onerror = () => {
                    if (liveSseConnectTimer) clearTimeout(liveSseConnectTimer);
                    liveSseConnectTimer = null;
                    try { es.close(); } catch (e) {}
                    if (liveSse === es) liveSse = null;
                    scheduleLiveSseReconnect();
                };
            } catch (e) {
                scheduleLiveSseReconnect();
            }
        }

        function scheduleLiveSseReconnect() {
            if (liveSseReconnectTimer || document.hidden) return;
            const delay = liveSseBackoffMs;
            liveSseBackoffMs = Math.min(60000, liveSseBackoffMs * 2);
            liveSseReconnectTimer = setTimeout(() => {
                liveSseReconnectTimer = null;
                tryLiveSSE();
            }, delay);
        }

        // Stale-while-revalidate: paint the last cached result instantly
        // (marked as updating) and refresh in the background. Skeleton
        // only when there is no cache at all.
        (function bootLiveFromCache() {
            const cached = readLiveCache();
            if (cached && cached.games.length > 0) {
                liveLastUpdatedAt = cached.at;
                liveUpdating = true;
                renderLiveGames(cached.games);
                paintUpdated();
            } else {
                renderLiveSkeleton();
            }
        })();
        document.getElementById('live-retry')?.addEventListener('click', retryLiveNow);

        // Hero stats come from the bot's one authoritative public snapshot.
        const HERO_STATS_URL = API_BASE + '/api/public_stats';
        const HERO_STATS_CACHE_KEY = 'nexus-hero-stats-v1';
        const HERO_STATS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
        const HERO_STATS_MAX_AGE_MS = 2 * 60 * 1000;
        const HERO_STATS_TIMEOUT_MS = 8000;
        const HERO_STATS_REFRESH_INTERVAL_MS = 30000;
        const HERO_STATS_RETRY_DELAYS_MS = [5000, 15000, 30000, 60000];
        let heroStatsSnapshot = null;
        let heroStatsAnchor = null;
        let heroStatsInFlight = false;
        let heroStatsFailed = false;
        let heroStatsRetryTimer = null;
        let heroStatsRetryIndex = 0;

        function isValidHeroStats(data) {
            if (!data) return false;
            const members = Number(data.ninja_nexus_members ?? data.total_users
                ?? data.total_members ?? data.member_count);
            const servers = Number(data.total_servers ?? data.server_count);
            const ping = Number(data.ping);
            if (![members, servers, ping]
                .every(value => Number.isFinite(value) && value > 0)) return false;
            const hasUptime = data.uptime_seconds !== null && data.uptime_seconds !== undefined
                && Number.isFinite(Number(data.uptime_seconds)) && Number(data.uptime_seconds) >= 0;
            if (!hasUptime) return true;
            const uptime = Number(data.uptime_seconds);
            const startedAt = Number(data.started_at);
            const serverTime = Number(data.server_time);
            if (Number.isFinite(startedAt) && startedAt > 0
                    && Number.isFinite(serverTime) && serverTime > 0) {
                return Math.abs((serverTime - startedAt) - uptime) <= 5;
            }
            return !(Number.isFinite(startedAt) && startedAt > 0)
                && !(Number.isFinite(serverTime) && serverTime > 0);
        }

        function normalizeHeroStats(data, savedAt = Date.now()) {
            if (!isValidHeroStats(data)) return null;
            const hasUptime = data.uptime_seconds !== null && data.uptime_seconds !== undefined
                && Number.isFinite(Number(data.uptime_seconds)) && Number(data.uptime_seconds) >= 0;
            const uptimeSeconds = hasUptime ? Number(data.uptime_seconds) : null;
            const serverTime = hasUptime
                ? (Number(data.server_time) > 0 ? Number(data.server_time) : Math.floor(savedAt / 1000))
                : null;
            const startedAt = hasUptime
                ? (Number(data.started_at) > 0 ? Number(data.started_at) : serverTime - uptimeSeconds)
                : null;
            return {
                ninja_nexus_members: Number(data.ninja_nexus_members ?? data.total_users
                    ?? data.total_members ?? data.member_count),
                total_users: Number(data.total_users ?? data.ninja_nexus_members
                    ?? data.total_members ?? data.member_count),
                total_servers: Number(data.total_servers ?? data.server_count),
                ping: Number(data.ping),
                started_at: startedAt,
                server_time: serverTime,
                uptime_seconds: uptimeSeconds,
                online_count: Number.isFinite(Number(data.online_count))
                    ? Number(data.online_count) : null,
                online_members: Number.isInteger(data.online_members) && data.online_members >= 0
                    ? data.online_members : null,
                saved_at: savedAt
            };
        }

        function formatHeroUptime(seconds) {
            const wholeSeconds = Math.floor(seconds);
            if (!Number.isFinite(wholeSeconds) || wholeSeconds < 0) return '–';
            const hours = Math.floor(wholeSeconds / 3600);
            const minutes = Math.floor((wholeSeconds % 3600) / 60);
            const remaining = wholeSeconds % 60;
            let value = '';
            if (hours > 0) value += `${hours}h `;
            if (minutes > 0 || hours > 0) value += `${minutes}m `;
            return `${value}${remaining}s`.trim();
        }

        function heroStatsAgeText(savedAt) {
            return savedAt ? fmtAgo(Date.now() - savedAt) : 'unknown';
        }

        function setHeroStatsStatus(text, { updating = false, retry = false } = {}) {
            const status = document.getElementById('hero-stats-status');
            const statusText = document.getElementById('hero-stats-status-text');
            const retryButton = document.getElementById('hero-stats-retry');
            const chips = document.querySelector('.hero-chips');
            if (status) {
                if (statusText) statusText.textContent = text;
                status.hidden = !text;
            }
            if (retryButton) retryButton.hidden = !retry;
            if (chips) chips.classList.toggle('is-updating', updating);
        }

        function paintHeroStatsUptime() {
            const hero = document.getElementById('hero-uptime');
            if (!heroStatsSnapshot || !Number.isFinite(heroStatsSnapshot.uptime_seconds)) {
                if (hero) {
                    hero.textContent = '–';
                    hero.classList.remove('stat-loading');
                }
                return;
            }
            let seconds = heroStatsSnapshot.uptime_seconds;
            if (heroStatsAnchor?.live) {
                const elapsedMs = Math.max(0, performance.now() - heroStatsAnchor.receivedAt);
                const serverNow = heroStatsAnchor.serverTimeMs + elapsedMs;
                seconds = Math.max(0, Math.floor((serverNow - heroStatsAnchor.startedAtMs) / 1000));
            }
            const formatted = formatHeroUptime(seconds);
            const about = document.getElementById('about-uptime');
            if (hero) {
                hero.textContent = formatted;
                hero.classList.remove('stat-loading');
            }
            if (about) about.textContent = `Bot uptime: ${formatted}`;
        }

        function paintHeroStats(snapshot, { cached = false } = {}) {
            heroStatsSnapshot = snapshot;
            const hasUptime = Number.isFinite(snapshot.uptime_seconds)
                && Number.isFinite(snapshot.started_at) && Number.isFinite(snapshot.server_time);
            heroStatsAnchor = hasUptime ? {
                startedAtMs: snapshot.started_at * 1000,
                serverTimeMs: snapshot.server_time * 1000,
                receivedAt: performance.now() - Math.max(0, Date.now() - snapshot.saved_at),
                live: !cached && Date.now() - snapshot.saved_at <= HERO_STATS_MAX_AGE_MS
            } : null;
            updateMemberDisplays(snapshot.ninja_nexus_members);
            updateOnlineDisplays(snapshot.online_members);
            updateServerStatStrip(snapshot.total_servers);

            const hp = document.getElementById('hero-ping');
            const ap = document.getElementById('about-ping');
            if (hp) {
                hp.textContent = Number.isFinite(snapshot.ping) ? `${snapshot.ping} ms` : '–';
                hp.classList.remove('stat-loading');
            }
            if (ap) ap.textContent = `${snapshot.ping}ms`;
            updateLoungeStats(snapshot.total_users ?? snapshot.ninja_nexus_members,
                snapshot.online_count, undefined);
            paintHeroStatsUptime();
            setHeroStatsStatus(`Last updated ${heroStatsAgeText(snapshot.saved_at)}`);
        }

        function readHeroStatsCache() {
            try {
                const cached = JSON.parse(localStorage.getItem(HERO_STATS_CACHE_KEY));
                const isFresh = cached && Number.isFinite(cached.saved_at)
                    && cached.saved_at <= Date.now()
                    && Date.now() - cached.saved_at < HERO_STATS_CACHE_MAX_AGE_MS;
                const normalized = isFresh
                    ? normalizeHeroStats(cached, cached.saved_at) : null;
                if (normalized) {
                    paintHeroStats(normalized, { cached: true });
                    return true;
                }
            } catch (error) {}
            return false;
        }

        function scheduleHeroStatsRetry() {
            if (heroStatsRetryTimer || heroStatsInFlight || document.hidden) return;
            const delay = HERO_STATS_RETRY_DELAYS_MS[
                Math.min(heroStatsRetryIndex, HERO_STATS_RETRY_DELAYS_MS.length - 1)
            ];
            heroStatsRetryIndex = Math.min(heroStatsRetryIndex + 1, HERO_STATS_RETRY_DELAYS_MS.length - 1);
            heroStatsRetryTimer = setTimeout(() => {
                heroStatsRetryTimer = null;
                fetchPublicStats();
            }, delay);
        }

        function showHeroStatsUnavailable() {
            ['hero-online', 'hero-members', 'hero-uptime', 'hero-ping', 'online-now-stat', 'about-online-stat', 'user-count-stat']
                .forEach(id => {
                    const element = document.getElementById(id);
                    if (!element) return;
                    element.textContent = '–';
                    element.classList.remove('stat-loading');
                });
        }

        async function fetchPublicStats() {
            if (heroStatsInFlight || document.hidden) return;
            heroStatsInFlight = true;
            if (heroStatsSnapshot) {
                setHeroStatsStatus(`Last updated ${heroStatsAgeText(heroStatsSnapshot.saved_at)}`);
            } else {
                setHeroStatsStatus('Loading live stats…');
            }

            try {
                const data = await fetchJson(HERO_STATS_URL, HERO_STATS_TIMEOUT_MS);
                if (!isValidHeroStats(data) || data.stale === true) {
                    throw new Error('Invalid or stale hero stats');
                }
                const snapshot = normalizeHeroStats(data);
                if (!snapshot) throw new Error('Invalid hero stats values');
                paintHeroStats(snapshot);
                try { localStorage.setItem(HERO_STATS_CACHE_KEY, JSON.stringify(snapshot)); } catch (error) {}
                heroStatsFailed = false;
                heroStatsRetryIndex = 0;
                if (heroStatsRetryTimer) {
                    clearTimeout(heroStatsRetryTimer);
                    heroStatsRetryTimer = null;
                }
            } catch (error) {
                heroStatsFailed = true;
                if (heroStatsSnapshot) {
                    if (heroStatsAnchor) heroStatsAnchor.live = false;
                    paintHeroStatsUptime();
                    setHeroStatsStatus(`Last updated ${heroStatsAgeText(heroStatsSnapshot.saved_at)}`);
                } else {
                    showHeroStatsUnavailable();
                    setHeroStatsStatus('Live stats are temporarily unavailable.', { retry: true });
                }
            } finally {
                heroStatsInFlight = false;
            }
            if (heroStatsFailed) scheduleHeroStatsRetry();
        }

        document.getElementById('hero-stats-retry').addEventListener('click', () => {
            if (heroStatsInFlight) return;
            if (heroStatsRetryTimer) {
                clearTimeout(heroStatsRetryTimer);
                heroStatsRetryTimer = null;
            }
            heroStatsRetryIndex = 0;
            fetchPublicStats();
        });

        readHeroStatsCache();
        setInterval(() => {
            if (heroStatsAnchor?.live && heroStatsSnapshot
                    && Date.now() - heroStatsSnapshot.saved_at > HERO_STATS_MAX_AGE_MS) {
                heroStatsAnchor.live = false;
                if (!heroStatsFailed) {
                    setHeroStatsStatus(`Last updated ${heroStatsAgeText(heroStatsSnapshot.saved_at)}`);
                }
            }
            if (heroStatsFailed && heroStatsSnapshot) {
                setHeroStatsStatus(`Last updated ${heroStatsAgeText(heroStatsSnapshot.saved_at)}`);
            }
            paintHeroStatsUptime();
        }, 1000);

        // ── Single-loop live sync: SSE when reachable, else 10s poll ──
        // Paused while the tab is hidden, resumed on focus/visibility.
        let liveInterval = null;
        let heroInterval = null;
        function startLiveLoop() {
            if (liveInterval) clearInterval(liveInterval);
            tryLiveSSE();
            fetchLiveGames();
            liveInterval = setInterval(() => { if (!document.hidden) fetchLiveGames(); }, 10000);
        }
        function stopLiveLoop() {
            if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
            liveGen++; // invalidate in-flight fetches: one loop only
            liveRequestInFlight = false;
            if (liveRetryTimer) { clearTimeout(liveRetryTimer); liveRetryTimer = null; }
            liveRetryAt = 0;
            if (liveSseReconnectTimer) {
                clearTimeout(liveSseReconnectTimer);
                liveSseReconnectTimer = null;
            }
            if (liveSseConnectTimer) {
                clearTimeout(liveSseConnectTimer);
                liveSseConnectTimer = null;
            }
            if (liveSse) { try { liveSse.close(); } catch (e) {} liveSse = null; }
        }
        // Back-compat names used by the WS fallback client below.
        function startStatsPolling() { startLiveLoop(); }
        function stopStatsPolling() { stopLiveLoop(); }
        function startHeroLoop() {
            if (heroInterval) clearInterval(heroInterval);
            fetchPublicStats();
            heroInterval = setInterval(() => {
                if (!document.hidden && !heroStatsFailed) fetchPublicStats();
            }, HERO_STATS_REFRESH_INTERVAL_MS);
        }

        const liveSocketClient = new NexusLiveSocketClient();

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (heroStatsRetryTimer) {
                    clearTimeout(heroStatsRetryTimer);
                    heroStatsRetryTimer = null;
                }
                if (heroStatsAnchor) heroStatsAnchor.live = false;
                liveSocketClient.pause();
                stopLiveLoop();
            } else {
                liveSocketClient.resume();
                startLiveLoop();
                if (heroStatsFailed) scheduleHeroStatsRetry();
                else fetchPublicStats();
            }
        });
        window.addEventListener('focus', () => { startLiveLoop(); });

        // Start network work after the initial page load so it cannot delay first paint.
        window.addEventListener('load', () => {
            startLiveLoop();
            startHeroLoop();
            liveSocketClient.connect();
        }, { once: true });

        // ── Phase 5: Lounge Subnav & Community Stats Loader (real aggregates) ──
        const MOST_PLAYED_LIMIT = 8;

        function renderMostPlayedCard(g, idx) {
            const gameName = g.name || g.game_name || 'Game';
            const totalHours = (g.total_hours !== undefined && g.total_hours !== null) ? g.total_hours : 0;
            const playerCount = g.unique_players || 0;
            const playersText = `${playerCount} ${playerCount === 1 ? 'player' : 'players'}, ${totalHours} h`;
            const isHot = idx === 0;
            const theme = getGameTheme(gameName, g.category);

            return `
                <div class="game-card reveal visible ${isHot ? 'is-hot' : ''}" data-game-name="${escapeHtml(gameName)}" style="--game-accent: ${theme.accent}; --game-accent-border: ${theme.border};">
                    <div class="game-card-img-wrap">
                        ${coverImgHtml(g, escapeHtml(gameName))}
                    </div>
                    <div class="game-card-body">
                        <div class="game-genre-tag">${escapeHtml(theme.tag)}</div>
                        <div class="game-name" title="${escapeHtml(gameName)}">${escapeHtml(gameName)}</div>
                        <div class="game-players-strip">
                            <div class="game-player-headline" style="margin-bottom: 0;">
                                <span class="game-player-name">${escapeHtml(playersText)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        function openMostPlayedModal(g, coverUrl) {
            if (!gameModal) return;
            const gameName = g.name || g.game_name || 'Game';
            const totalHours = (g.total_hours !== undefined && g.total_hours !== null) ? g.total_hours : 0;
            const playerCount = g.unique_players || 0;
            const sessionCount = g.sessions || 0;
            const coverEl = document.getElementById('modal-game-cover');
            const titleEl = document.getElementById('modal-game-title');
            const countEl = document.getElementById('modal-game-count');
            const listEl = document.getElementById('modal-players-list');

            if (coverEl) {
                const chain = coverChain(g);
                resetAutoArt(coverEl);
                coverEl.onerror = function () { coverStep(coverEl); };
                coverEl.dataset.next = chain.slice(1).join('|');
                coverEl.src = coverUrl || chain[0];
                if ((coverUrl || chain[0]).indexOf('/auto/') !== -1) {
                    markAutoArt(coverEl, coverUrl || chain[0]);
                }
            }
            if (titleEl) titleEl.textContent = gameName;
            if (countEl) countEl.textContent = `${totalHours} h total this week`;

            if (listEl) {
                if (window.modalActivityInterval) clearInterval(window.modalActivityInterval);
                listEl.innerHTML = '';
                const rows = [
                    { label: 'Players this week', value: `${playerCount} ${playerCount === 1 ? 'player' : 'players'}` },
                    { label: 'Time played', value: `${totalHours} hours total` },
                    { label: 'Sessions', value: `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}` }
                ];
                rows.forEach(r => {
                    const item = document.createElement('div');
                    item.className = 'modal-player-item';
                    item.innerHTML = `
                        <div class="modal-player-info">
                            <div class="modal-player-name">${escapeHtml(r.label)}</div>
                            <div class="modal-player-detail">${escapeHtml(r.value)}</div>
                        </div>
                    `;
                    listEl.appendChild(item);
                });
            }

            gameModal.classList.add('active');
            gameModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }

        function bindMostPlayedCards(container, gamesList) {
            container.querySelectorAll('.game-card').forEach((card, idx) => {
                const g = gamesList[idx];
                if (!g) return;
                const gameName = g.name || g.game_name || 'Game';
                const coverUrl = getGameImageUrl(g.image ? g : gameName);
                card.addEventListener('click', () => {
                    openMostPlayedModal(g, coverUrl);
                });
            });
        }

        // Per-GAME payloads only. Accepts the new bot shape (game_key/name/
        // category/image) AND the legacy bot shape (name/total_hours/
        // unique_players/rich_cover, no game_key). Member leaderboards
        // (voice_stats shape: display_name/total_seconds) are REJECTED here —
        // mapping them into game cards was the wrong-data bug (member names
        // as titles, "1 player", generic labels).
        function normalizeMostPlayed(data) {
            if (!data) return [];
            if (Array.isArray(data.games)) {
                return data.games
                    .filter((g) => g && (g.name || g.game_name)
                        && (g.total_hours !== undefined || g.unique_players !== undefined))
                    .map((g, i) => {
                        const name = g.name || g.game_name || 'Game';
                        const picked = pickCover({ game_key: g.game_key, name, category: g.category, image: g.image });
                        return {
                            rank: g.rank ?? i + 1,
                            game_key: g.game_key || slugOf(name),
                            name,
                            category: g.category || 'Other',
                            image: picked.primary,
                            fallback: picked.secondary,
                            rich_cover: null,
                            unique_players: g.unique_players ?? 0,
                            total_hours: g.total_hours ?? 0,
                            sessions: g.sessions ?? 0,
                            top_players: Array.isArray(g.top_players) ? g.top_players : []
                        };
                    });
            }
            return [];
        }

        function renderMostPlayedGames(container, games) {
            const topGames = games
                .map((game, index) => ({ game, index }))
                .sort((a, b) => {
                    const hoursA = Number(a.game.total_hours) || 0;
                    const hoursB = Number(b.game.total_hours) || 0;
                    return hoursB - hoursA || a.index - b.index;
                })
                .slice(0, MOST_PLAYED_LIMIT)
                .map(({ game }) => game);
            let html = '<div class="live-games-grid most-played-grid">';
            topGames.forEach((g, idx) => {
                html += renderMostPlayedCard(g, idx);
            });
            html += '</div>';
            container.innerHTML = html;
            bindMostPlayedCards(container, topGames);
        }

        function renderMostPlayedEmpty(container) {
            container.innerHTML = '<div class="live-games-grid"><div class="empty-lounge-state">'
                + '<div class="empty-lounge-box">'
                + '<h3 class="empty-lounge-title">No playtime logged this week yet.</h3>'
                + '<p class="empty-lounge-sub">Play a game on Discord and it will show up here.</p>'
                + '<div class="empty-lounge-actions">'
                + '<a href="https://discord.gg/fZNDG5sfhf" target="_blank" rel="noopener noreferrer" class="empty-lounge-discord-btn">Join Discord</a>'
                + '</div></div></div>';
        }

        function renderMostPlayedError(container, hasStaleGames) {
            const message = "Couldn't load data, retrying...";
            if (hasStaleGames) {
                let banner = container.querySelector('.most-played-error-banner');
                if (!banner) {
                    banner = document.createElement('div');
                    banner.className = 'empty-lounge-state most-played-error-banner';
                    container.insertBefore(banner, container.firstChild);
                }
                banner.innerHTML = `<div class="empty-lounge-box" role="status"><h3 class="empty-lounge-title">${message}</h3>`
                    + '<button type="button" class="btn btn-primary most-played-retry">Retry</button></div>';
            } else {
                container.innerHTML = '<div class="empty-lounge-state"><div class="empty-lounge-box" role="status">'
                    + `<h3 class="empty-lounge-title">${message}</h3>`
                    + '<button type="button" class="btn btn-primary most-played-retry">Retry</button>'
                    + '</div></div>';
            }
            const retry = container.querySelector('.most-played-retry');
            if (retry) retry.addEventListener('click', () => fetchMostPlayedStats(true));
        }

        function scheduleMostPlayedRetry(container, gen) {
            const retryDelay = mostPlayedRetryDelay;
            mostPlayedRetryDelay = Math.min(mostPlayedRetryDelay * 2, 60000);
            mostPlayedRetryTimer = setTimeout(() => {
                const lounge = document.getElementById('lounge');
                if (gen === mostPlayedGen && container.style.display !== 'none'
                        && lounge && lounge.classList.contains('active') && !document.hidden) {
                    fetchMostPlayedStats();
                }
            }, retryDelay);
        }

        let mostPlayedGen = 0;
        let mostPlayedLastGood = null;
        let mostPlayedController = null;
        let mostPlayedRetryTimer = null;
        let mostPlayedRetryDelay = 2000;
        async function fetchMostPlayedStats(manualRetry = false) {
            const container = document.getElementById('lounge-most-played-container');
            if (!container) return;
            const gen = ++mostPlayedGen;
            if (mostPlayedRetryTimer) {
                clearTimeout(mostPlayedRetryTimer);
                mostPlayedRetryTimer = null;
            }
            if (mostPlayedController) mostPlayedController.abort();

            if (manualRetry) mostPlayedRetryDelay = 2000;
            if (mostPlayedLastGood && mostPlayedLastGood.games.length > 0) {
                renderMostPlayedGames(container, mostPlayedLastGood.games);
            } else if (!mostPlayedLastGood) {
                container.innerHTML = '<div class="live-games-grid" aria-busy="true">'
                    + '<div class="skeleton-card" aria-hidden="true"></div>'
                    + '<div class="skeleton-card" aria-hidden="true"></div>'
                    + '<div class="skeleton-card" aria-hidden="true"></div>'
                    + '</div>';
            } else {
                renderMostPlayedEmpty(container);
            }

            // Same-origin only (no mixed content). Per-GAME endpoints only —
            // voice_stats is intentionally NOT consulted (member shape).
            const controller = new AbortController();
            mostPlayedController = controller;
            const timeout = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch(API_BASE + '/api/public/most-played?range=7d', {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' }
                });
                if (!response.ok) throw new Error(`Most-played request failed (${response.status})`);
                const payload = await response.json();
                if (!payload || !Array.isArray(payload.games)) {
                    throw new Error('Invalid most-played response');
                }
                if (payload.stale === true && payload.games.length === 0) {
                    throw new Error('Most-played upstream is stale and empty');
                }
                const games = normalizeMostPlayed(payload);
                if (payload.games.length > 0 && games.length === 0) {
                    throw new Error('Invalid most-played game data');
                }
                if (gen !== mostPlayedGen) return;
                mostPlayedLastGood = { games, at: Date.now() };
                if (games.length > 0) renderMostPlayedGames(container, games);
                else renderMostPlayedEmpty(container);
                if (payload.stale === true) {
                    renderMostPlayedError(container, games.length > 0);
                    scheduleMostPlayedRetry(container, gen);
                    return;
                }
                mostPlayedRetryDelay = 2000;
            } catch (err) {
                if (gen !== mostPlayedGen) return;
                const hasStaleGames = !!(mostPlayedLastGood && mostPlayedLastGood.games.length > 0);
                renderMostPlayedError(container, hasStaleGames);
                scheduleMostPlayedRetry(container, gen);
            } finally {
                clearTimeout(timeout);
                if (gen === mostPlayedGen) mostPlayedController = null;
            }
        }

        // ── Spotify "Now Listening" (same-origin /api/spotify, 4s poll) ──
        // Album art is Spotify CDN (https) — safe to hotlink, unlike game art.
        // Progress bars animate client-side via requestAnimationFrame (no load).
        const SPOTIFY_API_URL = API_BASE + '/api/spotify';
        let spotifyGen = 0;
        let spotifyInterval = null;
        let spotifyDigest = '';
        let spotifyRaf = null;
        let spotifyConsecFails = 0;

        function spotifyAvatar(url, name) {
            const u = (url || '').trim() || 'https://cdn.discordapp.com/embed/avatars/0.png';
            const full = u.includes('cdn.discordapp.com') && !u.includes('?') ? u + '?size=64' : u;
            return avatarImgHtml(name || 'Member', full, 'Listening on Spotify', 26);
        }
        function fmtTrackTime(ms) {
            if (!ms || ms < 0) return '0:00';
            const s = Math.floor(ms / 1000);
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        }
        function renderSpotifyEmpty(offline) {
            return `<div class="empty-lounge-state"><div class="empty-lounge-box">`
                + `<h3 class="empty-lounge-title">${offline ? 'Live feed is offline, try again soon.' : 'Nobody is listening right now'}</h3>`
                + `<p class="empty-lounge-sub">${offline ? 'Could not reach the live server. Check back shortly.' : 'Play a song on Spotify with Discord connected and it will show up here.'}</p>`
                + `<div class="empty-lounge-actions"><a href="https://discord.gg/fZNDG5sfhf" target="_blank" rel="noopener noreferrer" class="empty-lounge-discord-btn">Join Discord</a></div>`
                + `</div></div>`;
        }
        function renderSpotify(listeners, isOffline) {
            const container = document.getElementById('lounge-spotify-container');
            if (!container) return;
            if (!Array.isArray(listeners) || listeners.length === 0) {
                if (spotifyDigest === (isOffline ? 'OFFLINE' : 'EMPTY') && container.querySelector('.empty-lounge-state')) return;
                spotifyDigest = isOffline ? 'OFFLINE' : 'EMPTY';
                container.innerHTML = `<div class="spotify-grid">${renderSpotifyEmpty(!!isOffline)}</div>`;
                stopSpotifyRaf();
                return;
            }
            const digest = JSON.stringify(listeners.map(l => [l.title, l.artist, l.name, l.start, l.end]));
            if (digest === spotifyDigest && container.querySelector('.spotify-card')) return; // smooth: no re-render on same song
            spotifyDigest = digest;
            const single = listeners.length === 1 ? ' single-track' : '';
            let html = `<div class="spotify-grid${single}">`;
            listeners.slice(0, 12).forEach((l) => {
                const title = l.title || 'Unknown track';
                const artist = l.artist || 'Unknown artist';
                const art = (l.art || '').trim();
                const artImg = art
                    ? `<img src="${escapeHtml(art)}" alt="${escapeHtml(title)}" width="350" height="175" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='images/games/fallback.svg';">`
                    : `<img src="images/games/fallback.svg" alt="${escapeHtml(title)}" width="350" height="175" loading="lazy" decoding="async">`;
                const openLink = l.track_url
                    ? `<a class="spotify-open" href="${escapeHtml(l.track_url)}" target="_blank" rel="noopener noreferrer" title="Open in Spotify" aria-label="Open in Spotify">Open</a>`
                    : '';
                html += `<div class="spotify-card reveal visible">`
                    + `<div class="spotify-art-wrap">${artImg}<span class="spotify-live-pill"><span class="lounge-live-dot"></span> Listening</span></div>`
                    + `<div class="spotify-body">`
                    + `<div class="spotify-track" title="${escapeHtml(title)}">${escapeHtml(title)}</div>`
                    + `<div class="spotify-artist" title="${escapeHtml(artist)}">${escapeHtml(artist)}</div>`
                    + `<div class="spotify-progress-row"><div class="spotify-progress"><div class="spotify-progress-fill" data-sp-start="${l.start ?? ''}" data-sp-end="${l.end ?? ''}"></div></div>`
                    + `<div class="spotify-times"><span data-sp-elapsed>0:00</span><span>${fmtTrackTime((l.end && l.start) ? (l.end - l.start) : 0)}</span></div></div>`
                    + `<div class="spotify-user-row">${spotifyAvatar(l.avatar, l.name)}<span class="spotify-user-name">${escapeHtml(l.name || 'Member')}</span>${openLink}</div>`
                    + `</div></div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            startSpotifyRaf();
        }
        function stopSpotifyRaf() {
            if (spotifyRaf) { cancelAnimationFrame(spotifyRaf); spotifyRaf = null; }
        }
        function startSpotifyRaf() {
            stopSpotifyRaf();
            const tick = () => {
                const now = Date.now();
                document.querySelectorAll('#lounge-spotify-container .spotify-progress-fill').forEach((el) => {
                    const s = parseInt(el.getAttribute('data-sp-start') || '', 10);
                    const e = parseInt(el.getAttribute('data-sp-end') || '', 10);
                    const card = el.closest('.spotify-card');
                    const elapsedEl = card ? card.querySelector('[data-sp-elapsed]') : null;
                    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
                        el.style.width = '0%';
                        if (elapsedEl) elapsedEl.textContent = '0:00';
                        return;
                    }
                    const pct = Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100));
                    el.style.width = pct.toFixed(1) + '%';
                    if (elapsedEl) elapsedEl.textContent = fmtTrackTime(Math.max(0, now - s));
                });
                spotifyRaf = requestAnimationFrame(tick);
            };
            spotifyRaf = requestAnimationFrame(tick);
        }
        async function fetchSpotify() {
            const container = document.getElementById('lounge-spotify-container');
            if (!container || container.style.display === 'none') return; // poll only when visible
            const gen = ++spotifyGen;
            try {
                const data = await fetchJson(SPOTIFY_API_URL + '?_t=' + Date.now(), 4000);
                if (gen !== spotifyGen) return;
                spotifyConsecFails = 0;
                const listeners = Array.isArray(data.listeners) ? data.listeners : [];
                if (listeners.length === 0 && data && data.stale === true && spotifyDigest && spotifyDigest !== 'EMPTY' && spotifyDigest !== 'OFFLINE') return; // keep last good cards on blip
                renderSpotify(listeners, false);
            } catch (err) {
                if (gen !== spotifyGen) return;
                spotifyConsecFails++;
                if (spotifyConsecFails >= 3 && !container.querySelector('.spotify-card')) {
                    renderSpotify([], true);
                }
            }
        }
        function startSpotifyLoop() {
            if (spotifyInterval) clearInterval(spotifyInterval);
            fetchSpotify();
            spotifyInterval = setInterval(() => { if (!document.hidden) fetchSpotify(); }, 4000);
        }
        function stopSpotifyLoop() {
            if (spotifyInterval) { clearInterval(spotifyInterval); spotifyInterval = null; }
            spotifyGen++;
            stopSpotifyRaf();
        }

        // Subnav switcher (selected tab persists across refreshes).
        function setLoungeTab(tab) {
            document.querySelectorAll('.lounge-tab-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-lounge-tab') === tab);
            });
            const liveGrid = document.getElementById('live-games-grid');
            const mostPlayed = document.getElementById('lounge-most-played-container');
            const spotify = document.getElementById('lounge-spotify-container');
            if (tab === 'most-played') {
                if (liveGrid) liveGrid.style.display = 'none';
                if (spotify) { spotify.style.display = 'none'; stopSpotifyLoop(); }
                if (mostPlayed) {
                    mostPlayed.style.display = '';
                    fetchMostPlayedStats();
                }
            } else if (tab === 'listening') {
                if (liveGrid) liveGrid.style.display = 'none';
                if (mostPlayed) mostPlayed.style.display = 'none';
                if (spotify) {
                    spotify.style.display = '';
                    spotifyDigest = '';
                    startSpotifyLoop();
                }
            } else {
                if (liveGrid) liveGrid.style.display = '';
                if (mostPlayed) mostPlayed.style.display = 'none';
                if (spotify) { spotify.style.display = 'none'; stopSpotifyLoop(); }
            }
            try { localStorage.setItem('nexus-lounge-tab', tab); } catch (e) {}
        }
        document.querySelectorAll('.lounge-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setLoungeTab(btn.getAttribute('data-lounge-tab'));
            });
        });
        // Restore the selected tab (default: live) without changing design.
        try {
            const savedTab = localStorage.getItem('nexus-lounge-tab');
            if (savedTab === 'most-played') setLoungeTab('most-played');
            else if (savedTab === 'listening') setLoungeTab('listening');
        } catch (e) {}
    