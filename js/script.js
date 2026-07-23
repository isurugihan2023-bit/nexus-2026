document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. Sticky Navbar & Scroll ---
    const navbar = document.getElementById('navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // --- 2. Intersection Observer for Scroll Animations ---
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Only animate once
            }
        });
    }, {
        root: null,
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    revealElements.forEach(el => revealObserver.observe(el));

    // --- 3. Animated Number Counters ---
    const statsSection = document.getElementById('stats');
    const statNumbers = document.querySelectorAll('.stat-number');
    let hasAnimatedStats = false;
    
    const animateValue = (obj, start, end, duration, suffix = '') => {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            const current = progress === 1 ? end : start + (end - start) * easeProgress;
            
            // Format number based on if it has decimals (like 99.99)
            if (end % 1 !== 0) {
                obj.innerHTML = current.toFixed(2) + suffix;
            } else {
                obj.innerHTML = Math.floor(current) + suffix;
            }
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }
    
    const statsObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !hasAnimatedStats) {
            hasAnimatedStats = true;
            statNumbers.forEach(stat => {
                const target = parseFloat(stat.getAttribute('data-target'));
                const suffix = stat.getAttribute('data-suffix') || '';
                animateValue(stat, 0, target, 2000, suffix);
            });
        }
    }, { threshold: 0.5 });
    
    if (statsSection) {
        statsObserver.observe(statsSection);
    }

    // --- 4. Command Search Filter ---
    const searchInput = document.getElementById('commandSearch');
    const commandsList = document.querySelectorAll('.command-item');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            
            commandsList.forEach(cmd => {
                const name = cmd.querySelector('.cmd-name').textContent.toLowerCase();
                const desc = cmd.querySelector('.cmd-desc').textContent.toLowerCase();
                
                if (name.includes(term) || desc.includes(term)) {
                    cmd.style.display = 'flex';
                } else {
                    cmd.style.display = 'none';
                }
            });
        });
    }

    // --- 5. Mobile Menu Toggle ---
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    const navActions = document.querySelector('.nav-actions');
    
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            // Very simple inline toggle for now
            const isExpanded = navLinks.style.display === 'flex';
            if (isExpanded) {
                navLinks.style.display = 'none';
                navActions.style.display = 'none';
            } else {
                navLinks.style.display = 'flex';
                navLinks.style.flexDirection = 'column';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.width = '100%';
                navLinks.style.background = '#09090B';
                navLinks.style.padding = '20px';
                navLinks.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
                
                navActions.style.display = 'flex';
                navActions.style.position = 'absolute';
                navActions.style.top = 'calc(100% + 200px)'; // rough estimate below links
                navActions.style.left = '0';
                navActions.style.width = '100%';
                navActions.style.background = '#09090B';
                navActions.style.padding = '20px';
                navActions.style.justifyContent = 'center';
            }
        });
    }

    // --- 6. Fetch Real Bot Data from API ---
    // NOTE: Change this URL when hosting on Vercel to point to your live backend domain!
    const API_URL = '/api/public_stats';

    // Store the last fetched uptime to tick it locally
    let uptimeInterval = null;

    async function fetchPublicStats() {
        try {
            const response = await fetch(API_URL);
            if (!response.ok) throw new Error('API offline');
            const data = await response.json();
            
            // Update Uptime widget
            const uptimeStat = document.getElementById('hero-uptime-stat');
            if (uptimeStat && data.uptime) {
                uptimeStat.textContent = data.uptime;
                
                // Clear existing interval
                if (uptimeInterval) clearInterval(uptimeInterval);
                
                // Parse "0h 2m 33s" and tick locally
                let parts = data.uptime.match(/(\d+)h\s*(\d+)m\s*(\d+)s/);
                if (parts) {
                    let h = parseInt(parts[1]);
                    let m = parseInt(parts[2]);
                    let s = parseInt(parts[3]);
                    
                    uptimeInterval = setInterval(() => {
                        s++;
                        if (s >= 60) { s = 0; m++; }
                        if (m >= 60) { m = 0; h++; }
                        uptimeStat.textContent = `${h}h ${m}m ${s}s`;
                    }, 1000);
                }
            }
            
            const botStatus = document.getElementById('hero-bot-status');
            if (botStatus && data.bot_activity) {
                botStatus.textContent = data.bot_activity;
            }

            // Update Data Targets for Stats Grid so animation counts up to real numbers
            const serverStat = document.getElementById('server-count-stat');
            if (serverStat && data.total_servers !== undefined) {
                serverStat.setAttribute('data-target', data.total_servers);
                serverStat.textContent = data.total_servers; // Update immediately
            }
            
            const userStat = document.getElementById('user-count-stat');
            if (userStat && data.total_users !== undefined) {
                userStat.setAttribute('data-target', data.total_users);
                userStat.textContent = data.total_users; // Update immediately
            }
            
        } catch (error) {
            console.log('Could not fetch bot data:', error.message);
            const uptimeStat = document.getElementById('hero-uptime-stat');
            if (uptimeStat) uptimeStat.textContent = 'Offline';
        }
    }
    
    // Fetch real stats on load
    fetchPublicStats();
    
    // Refresh stats from server every 60 seconds
    setInterval(fetchPublicStats, 60000);
});
