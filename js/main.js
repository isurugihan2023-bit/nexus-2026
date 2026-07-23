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
                const displayServers = d.total_servers || 0;
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
                
                // Update Discord presence activity array with real stats
                if (typeof activities !== 'undefined') {
                    activities[1] = `${fmt(displayServers)} SERVERS`;
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
                const h = Math.floor(window.heroUptimeSec / 3600);
                const m = Math.floor((window.heroUptimeSec % 3600) / 60);
                const s = window.heroUptimeSec % 60;
                let timeStr = '';
                if (h > 0) timeStr += `${h}h `;
                if (m > 0 || h > 0) timeStr += `${m}m `;
                timeStr += `${s}s`;
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