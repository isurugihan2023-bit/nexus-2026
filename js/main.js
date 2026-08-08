/* ── Navbar scroll ── */
        const nav = document.getElementById('navbar');
        // ── Tab System ─────────────────────────────────────
        // All sections that are tabs
        const ALL_TABS = ['home', 'home-cta', 'about', 'features', 'commands', 'stats'];
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

        /* ── Reveal on scroll (Staggered) ── */
        const observer = new IntersectionObserver((entries) => {
            let delay = 0;
            entries.forEach(e => { 
                if (e.isIntersecting) { 
                    setTimeout(() => e.target.classList.add('visible'), delay);
                    delay += 120; // 120ms stagger
                    observer.unobserve(e.target);
                } 
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        /* ── Count-up animation ── */
        function countUp(el) {
            const target = parseFloat(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            const isFloat = target % 1 !== 0;
            const duration = 1600;
            const start = performance.now();
            function step(now) {
                const p = Math.min((now - start) / duration, 1);
                const ease = 1 - Math.pow(1 - p, 3);
                const val = target * ease;
                el.textContent = (isFloat ? val.toFixed(2) : Math.floor(val)) + suffix;
                if (p < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(e => { if (e.isIntersecting) { countUp(e.target); statObserver.unobserve(e.target); } });
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
                        setTimeout(() => cat.style.display = 'none', 300);
                    }
                });
            });
        });

        /* ── Live stats from API ── */
        async function fetchPublicStats() {
            try {
                const r = await fetch('/api/public_stats?t=' + Date.now());
                if (!r.ok) return;
                const d = await r.json();
                const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : n;
                
                // Real stats
                const displayServers = 1; // Forced to 1 per user request
                const displayUsers = d.total_users || 0;
                
                document.getElementById('hero-servers').textContent = fmt(displayServers);
                document.getElementById('hero-members').textContent = fmt(displayUsers);
                if (d.uptime_seconds !== undefined) {
                    window.heroUptimeSec = d.uptime_seconds;
                } else {
                    document.getElementById('hero-uptime').textContent = d.uptime || '--';
                }
                document.getElementById('hero-ping').textContent = (d.ping || '--') + ' ms';
                // About section stat boxes
                const aServ = document.getElementById('about-servers');
                const aUsers = document.getElementById('about-users');
                const aPing = document.getElementById('about-ping');
                if (aServ) aServ.textContent = fmt(displayServers);
                if (aUsers) aUsers.textContent = fmt(displayUsers);
                if (aPing) aPing.textContent = (d.ping || '--') + 'ms';
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
            } catch(e) {}
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
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
        }

        function animateVisualizer() {
            if (!isVisualizerRunning) return;
            requestAnimationFrame(animateVisualizer);
            
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate bass average (lower frequencies: roughly indices 0 to 10 out of 128)
            let bassSum = 0;
            for(let i = 0; i < 10; i++) {
                bassSum += dataArray[i];
            }
            const bassAvg = bassSum / 10;
            
            // Map bass (0-255) to a scale value (1.0 to 1.08)
            const scale = 1.0 + (bassAvg / 255) * 0.08;
            
            // Map bass to a subtle brightness bump (1.0 to 1.3)
            const brightness = 1.0 + (bassAvg / 255) * 0.3;

            // Map bass to particle opacity (0.2 to 1.0)
            const particleOpacity = 0.2 + (bassAvg / 255) * 0.8;
            
            // Map bass to text glow blur radius and opacity for .hero-sub
            // Glow color is a sleek purple: rgba(167, 139, 250, alpha)
            const glowAlpha = (bassAvg / 255) * 0.8; 
            const glowBlur = (bassAvg / 255) * 15;

            if (heroBgImg) {
                heroBgImg.style.transition = 'transform 0.05s ease-out, filter 0.05s ease-out';
                heroBgImg.style.transform = `scale(${scale})`;
                heroBgImg.style.filter = `brightness(${brightness})`;
            }

            if (particles1 && particles2) {
                particles1.style.opacity = particleOpacity;
                particles2.style.opacity = particleOpacity;
            }

            if (heroSub) {
                heroSub.style.transition = 'text-shadow 0.05s ease-out';
                if (glowAlpha > 0.1) {
                    heroSub.style.textShadow = `0 0 ${glowBlur}px rgba(167, 139, 250, ${glowAlpha})`;
                } else {
                    heroSub.style.textShadow = 'none';
                }
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