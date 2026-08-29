/* ── Navbar scroll ── */
        const nav = document.getElementById('navbar');
        // ── Tab System ─────────────────────────────────────
        // All sections that are tabs
        const ALL_TABS = ['home', 'home-cta', 'about', 'features', 'commands', 'stats', 'games'];
        // Home tabs = sections shown when on the hero page (NO cta)
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

            // Trigger scroll reveals and scroll to top
            setTimeout(() => { handleScroll(); }, 50);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Nav link clicks
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (!href || !href.startsWith('#')) return;
                e.preventDefault();
                const targetId = href.substring(1);
                // Set active underline
                document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                showTab(targetId);
            });
        });

        // Logo click = go home
        document.querySelector('.nav-logo').addEventListener('click', (e) => {
            e.preventDefault();
            showTab('home');
        });


        // Add scrolled class to nav
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 40);
        }, { passive: true });

                /* ── Nav Indicator Logic ── */
        const navLinks = document.querySelectorAll('.nav-links a');
        const navIndicator = document.querySelector('.nav-indicator');
        
        function updateNavIndicator(link) {
            if (!navIndicator || !link) return;
            const rect = link.getBoundingClientRect();
            const parentRect = link.closest('.nav-links').getBoundingClientRect();
            navIndicator.style.width = ${rect.width}px;
            navIndicator.style.transform = 	ranslateX(px);
            navIndicator.style.opacity = '1';
        }
        
        navLinks.forEach(link => {
            link.addEventListener('mouseenter', () => updateNavIndicator(link));
            link.addEventListener('click', () => updateNavIndicator(link));
        });
        const navLinksContainer = document.querySelector('.nav-links');
        if (navLinksContainer) {
            navLinksContainer.addEventListener('mouseleave', () => {
                const active = document.querySelector('.nav-links a.active');
                if (active) updateNavIndicator(active);
                else if (navIndicator) navIndicator.style.opacity = '0';
            });
        }
        setTimeout(() => {
            const initialActive = document.querySelector('.nav-links a.active');
            if (initialActive) updateNavIndicator(initialActive);
        }, 100);

        /* ── Reveal on scroll (Staggered) ── */
        const observer = new IntersectionObserver((entries) => {
            let delay = 0;
            const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            entries.forEach(e => { 
                if (e.isIntersecting) { 
                    setTimeout(() => e.target.classList.add('io-revealed'), delay);
                    delay += prefersReduced ? 0 : 90;
                    observer.unobserve(e.target);
                } 
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.io-reveal').forEach(el => observer.observe(el));

        /* ── Count-up animation (Async Sequenced) ── */
        const statCards = new Map();

        function runCountUp(elId) {
            const cardData = statCards.get(elId);
            if (!cardData || cardData.animated || cardData.resolvedValue === undefined) return;
            cardData.animated = true;
            const el = document.getElementById(elId);
            if (!el) return;
            
            const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            
            if (typeof cardData.resolvedValue === 'string' && (cardData.resolvedValue.includes(' ') || cardData.resolvedValue.includes('d'))) {
                el.textContent = cardData.resolvedValue;
                el.style.opacity = 0;
                el.style.transition = 'opacity 500ms var(--ease-entrance)';
                requestAnimationFrame(() => el.style.opacity = 1);
                return;
            }

            const target = parseFloat(cardData.resolvedValue);
            const suffix = cardData.suffix || '';
            
            if (isNaN(target) || prefersReduced) {
                el.textContent = cardData.resolvedValue + suffix;
                return;
            }

            const isFloat = target % 1 !== 0;
            const duration = 1200;
            const start = performance.now();
            
            function step(now) {
                const p = Math.min((now - start) / duration, 1);
                const ease = 1 - Math.pow(1 - p, 3);
                const val = target * ease;
                el.textContent = (isFloat ? val.toFixed(2) : Math.floor(val)) + suffix;
                if (p < 1) requestAnimationFrame(step);
                else el.textContent = cardData.resolvedValue + suffix;
            }
            requestAnimationFrame(step);
        }

        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    const id = e.target.id;
                    const cardData = statCards.get(id) || {};
                    cardData.inView = true;
                    statCards.set(id, cardData);
                    if (cardData.isDataReady) runCountUp(id);
                    statObserver.unobserve(e.target);
                }
            });
        }, { threshold: 0.4 });
        
        ['hero-servers', 'hero-members', 'hero-uptime', 'hero-ping', 'about-servers', 'about-users', 'about-ping'].forEach(id => {
            const el = document.getElementById(id);
            if (el) statObserver.observe(el);
        });

                /* ── CTA Button Pointer Glow ── */
        document.querySelectorAll('.btn-cta').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                if (prefersReduced) return;
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - 75;
                const y = e.clientY - rect.top - 75;
                btn.style.setProperty('--mouse-x', ${x}px);
                btn.style.setProperty('--mouse-y', ${y}px);
            });
        });
        
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
                        setTimeout(() => cat.style.display = 'none', 300);
                    }
                });
            });
        });

        // ── 4. FETCH LIVE STATS & GAMES ───────────────────────────────────
        async function fetchPublicStats() {
            try {
                // Using Vercel rewrite with stealth name (Bypasses Mixed Content and Brave Shields)
                const r = await fetch('/api/bot_data?t=' + Date.now());
                if (!r.ok) return;
                
                const d = await r.json();
                const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;
                
                // Real stats
                const displayServers = 1; // Forced to 1 per user request
                const displayUsers = d.total_users || 0;
                
                function setStatData(id, val, sfx='') {
                    const cardData = statCards.get(id) || { inView: false, animated: false };
                    if (!cardData.animated) {
                        cardData.resolvedValue = val;
                        cardData.suffix = sfx;
                        cardData.isDataReady = true;
                        statCards.set(id, cardData);
                        if (cardData.inView) runCountUp(id);
                    }
                }
                
                setStatData('hero-servers', displayServers);
                setStatData('hero-members', displayUsers);
                if (d.uptime_seconds !== undefined) {
                    window.heroUptimeSec = d.uptime_seconds;
                } else {
                    setStatData('hero-uptime', d.uptime || '--');
                }
                setStatData('hero-ping', d.ping || '--', ' ms');
                
                setStatData('about-servers', displayServers);
                setStatData('about-users', displayUsers);
                setStatData('about-ping', d.ping || '--', 'ms');
                // also update stat strip
                const sc = document.getElementById('server-count-stat');
                const uc = document.getElementById('user-count-stat');
                const cc = document.getElementById('cmd-count-stat');
                if (sc) { sc.dataset.target = displayServers; sc.dataset.suffix = ''; }
                if (uc) { uc.dataset.target = displayUsers; uc.dataset.suffix = ''; }
                if (cc && d.total_commands !== undefined) { cc.dataset.target = d.total_commands; cc.dataset.suffix = ''; }
                
                const serverLabelEl = document.getElementById('hero-servers-label');
                if (serverLabelEl) {
                    serverLabelEl.textContent = displayServers === 1 ? 'SERVER' : 'SERVERS';
                }
                
                // Update Discord presence activity array with real stats
                if (typeof activities !== 'undefined') {
                    activities[1] = `${fmt(displayServers)} ${displayServers === 1 ? 'SERVER' : 'SERVERS'}`;
                }
                
                // Render Live Games
                if (d.top_played_games && Array.isArray(d.top_played_games)) {
                    renderLiveGames(d.top_played_games);
                }
            } catch(e) {}
        }
        
        const GAME_IMAGE_OVERRIDES = {
            "Valorant": "https://cdn1.epicgames.com/offer/cbd5b3d355044b3e9508ece594d73507/EGS_VALORANT_RiotGames_S2_1200x1600-e7f0b5d9be69022634e56598c433364f?h=480&quality=medium&resize=1&w=360",
            "VALORANT": "https://cdn1.epicgames.com/offer/cbd5b3d355044b3e9508ece594d73507/EGS_VALORANT_RiotGames_S2_1200x1600-e7f0b5d9be69022634e56598c433364f?h=480&quality=medium&resize=1&w=360",
            "Minecraft": "https://cdn1.epicgames.com/offer/23114a806ec040909ff7b4b1a457492c/EGS_Minecraft_MojangStudios_S2_1200x1600-0e11894d306b3a3250b8ebae80447385?h=480&quality=medium&resize=1&w=360",
            "Roblox": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80",
            "ROBLOX": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80",
            "Fortnite": "https://cdn1.epicgames.com/offer/fn/Blade_2560x1440_2560x1440-ae7b0849d44e591be2580a5fb7a3ff99?h=480&quality=medium&resize=1&w=360",
            "Genshin Impact": "https://cdn1.epicgames.com/offer/879b0d8776ab46a59a129983baababf0/EGS_GenshinImpact_miHoYoLimited_S2_1200x1600-c12cdab43ca00742e995adfd50b0ba67?h=480&quality=medium&resize=1&w=360",
            "Honkai: Star Rail": "https://cdn1.epicgames.com/offer/4592928509374c439eb46d0a790db86c/EGS_HonkaiStarRail_COGNOSPHEREPTE_S2_1200x1600-5bb95183db7298642a865f12e84c98f8?h=480&quality=medium&resize=1&w=360",
            "Forza Horizon 5": "https://steamcdn-a.akamaihd.net/steam/apps/1551360/library_600x900_2x.jpg",
            "EA Sports FC 24": "https://steamcdn-a.akamaihd.net/steam/apps/2195250/library_600x900_2x.jpg",
            "EA SPORTS FC™ 24": "https://steamcdn-a.akamaihd.net/steam/apps/2195250/library_600x900_2x.jpg",
            "EA SPORTS FC 25": "https://steamcdn-a.akamaihd.net/steam/apps/2669320/library_600x900_2x.jpg",
            "Wuthering Waves": "https://cdn1.epicgames.com/offer/7521798363714856aee6dfa3ff4d284a/EGS_WutheringWaves_KuroGames_S2_1200x1600-bdfcb7d5d2cc8a0a9ed6d35dcfe6b31c?h=480&quality=medium&resize=1&w=360",
            "League of Legends": "https://brand.riotgames.com/static/a9e87d7c0fa30e2a4a6321918b11e8d4/829b3/lol-logo.png",
            "PUBG: BATTLEGROUNDS": "https://steamcdn-a.akamaihd.net/steam/apps/578080/library_600x900_2x.jpg",
            "Grand Theft Auto V": "https://steamcdn-a.akamaihd.net/steam/apps/271590/library_600x900_2x.jpg",
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
            "Rocket League": "https://cdn1.epicgames.com/offer/9773aa1aa54f4f7b80e44bef04986cea/EGS_RocketLeague_PsyonixLLC_S2_1200x1600-ee719e782847a9efec47cfc1fec25b29?h=480&quality=medium&resize=1&w=360"
        };

        const DEFAULT_COMMUNITY_GAMES = [
            { name: "VALORANT", count: 8 },
            { name: "Grand Theft Auto V", count: 6 },
            { name: "Counter-Strike 2", count: 5 },
            { name: "Wuthering Waves", count: 4 },
            { name: "Forza Horizon 5", count: 3 },
            { name: "Minecraft", count: 3 },
            { name: "Fortnite", count: 2 },
            { name: "Red Dead Redemption 2", count: 2 }
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
                const s = window.heroUptimeSec % 60;
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

        // ── Background Music Toggle & Audio Visualizer ──
        const musicToggle = document.getElementById('music-toggle');
        const bgMusic = document.getElementById('bg-music');
        const musicIcon = document.getElementById('music-icon');
        const heroBgImg = document.querySelector('.hero-img-bg');
        const particles1 = document.querySelector('.cyber-particles');
        const particles2 = document.querySelector('.cyber-particles-2');
        const heroSub = document.querySelector('.hero-sub');
        
        let audioCtx;
        let analyser;
        let dataArray;
        let source;
        let isVisualizerRunning = false;

        function initAudio() {
            if (audioCtx) return;
            // Safari uses webkitAudioContext
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            analyser = audioCtx.createAnalyser();
            source = audioCtx.createMediaElementSource(bgMusic);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            analyser.fftSize = 128; // Lower FFT size saves CPU cycles significantly
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }

        let smoothedBass = 0;
        let lastFrameTime = 0;

        function animateVisualizer(now) {
            if (!isVisualizerRunning) return;
            requestAnimationFrame(animateVisualizer);

            // Throttle to 30-60fps max to protect low-end CPUs
            if (now - lastFrameTime < 16) return;
            lastFrameTime = now;
            
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate bass average (first 6 bins)
            let bassSum = 0;
            for(let i = 0; i < 6; i++) {
                bassSum += dataArray[i];
            }
            const bassAvg = bassSum / 6;
            
            // Exponential smoothing for buttery motion
            smoothedBass += (bassAvg - smoothedBass) * 0.2;
            
            // Map bass (0-255) to a scale (1.0 to 1.04) and opacity (0.65 to 0.85)
            const scale = 1.0 + (smoothedBass / 255) * 0.04;
            const opacity = 0.65 + (smoothedBass / 255) * 0.15;

            if (heroBgImg) {
                heroBgImg.style.transform = `translate3d(0,0,0) scale(${scale.toFixed(3)})`;
                heroBgImg.style.opacity = opacity.toFixed(2);
            }
        }

        if (musicToggle && bgMusic) {
            // Set volume to 30% so it's chill background music
            bgMusic.volume = 0.3;

            const togglePlay = () => {
                if (bgMusic.paused) {
                    initAudio();
                    // Resume context if browser suspended it
                    if (audioCtx.state === 'suspended') {
                        audioCtx.resume();
                    }
                    bgMusic.play().then(() => {
                        musicIcon.classList.remove('fa-volume-mute');
                        musicIcon.classList.add('fa-music');
                        musicToggle.classList.add('playing');
                        isVisualizerRunning = true;
                        animateVisualizer();
                    }).catch(err => {
                        console.error('Audio playback failed:', err);
                    });
                } else {
                    bgMusic.pause();
                    musicIcon.classList.remove('fa-music');
                    musicIcon.classList.add('fa-volume-mute');
                    musicToggle.classList.remove('playing');
                    isVisualizerRunning = false;
                    
                    // Reset styling gently
                    if (heroBgImg) {
                        heroBgImg.style.transition = 'transform 0.5s ease, filter 0.5s ease';
                        heroBgImg.style.transform = `scale(1.0)`;
                        heroBgImg.style.filter = `brightness(1.0)`;
                    }
                    if (particles1 && particles2) {
                        particles1.style.opacity = 0.3;
                        particles2.style.opacity = 0.3;
                    }
                    if (heroSub) {
                        heroSub.style.textShadow = 'none';
                    }
                }
            };

            musicToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlay();
            });

            // Attempt autoplay on load
            setTimeout(() => {
                if (bgMusic.paused) {
                    togglePlay();
                }
            }, 500);

            // Fallback: If browser blocks autoplay, start music on the very first click anywhere on the page
            const startOnInteraction = () => {
                if (bgMusic.paused) {
                    togglePlay();
                }
                document.removeEventListener('click', startOnInteraction);
            };
            document.addEventListener('click', startOnInteraction);
        }
