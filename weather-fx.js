/* =====================================================================
   Weather Station Pro — background effects
   Canvas particles for the current condition + a time-of-day palette.
   ===================================================================== */

const WeatherFX = (() => {
    let canvas, ctx, particles = [], rafId = null;
    let current = 'clear', W = 0, H = 0;
    let flashAlpha = 0, nextFlash = 300;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = (a, b) => a + Math.random() * (b - a);

    /* ---------------- setup ---------------- */

    function ensureCanvas() {
        if (canvas) return true;
        canvas = document.getElementById('wfxCanvas');
        if (!canvas) return false;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', debounceResize);
        document.addEventListener('visibilitychange', () => {
            // don't burn battery animating a hidden tab
            if (document.hidden) pause();
            else resume();
        });
        return true;
    }

    let resizeTimer;
    function debounceResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    }

    function resize() {
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build(current);
    }

    /* ---------------- particles ---------------- */

    function build(kind) {
        particles = [];
        // scale with viewport area so phones stay smooth
        const density = Math.min(Math.round((W * H) / 16000), 220);

        if (kind === 'rain' || kind === 'drizzle' || kind === 'thunder') {
            const n = kind === 'drizzle' ? density * 0.55 : density;
            for (let i = 0; i < n; i++) {
                particles.push({
                    x: rand(0, W), y: rand(-H, H),
                    len: rand(9, kind === 'drizzle' ? 15 : 24),
                    vy: rand(kind === 'drizzle' ? 3.5 : 8, kind === 'drizzle' ? 6 : 14),
                    vx: rand(-1.4, -0.4),
                    a: rand(0.12, 0.4),
                });
            }
        }

        if (kind === 'snow') {
            for (let i = 0; i < density * 0.6; i++) {
                particles.push({
                    x: rand(0, W), y: rand(-H, H),
                    r: rand(1, 3.4),
                    vy: rand(0.4, 1.5),
                    drift: rand(0.4, 1.8),
                    phase: rand(0, Math.PI * 2),
                    a: rand(0.35, 0.9),
                });
            }
        }

        if (kind === 'clouds' || kind === 'mist') {
            for (let i = 0; i < 8; i++) {
                particles.push({
                    x: rand(-220, W), y: rand(H * 0.04, H * 0.6),
                    r: rand(110, 260),
                    vx: rand(0.06, 0.26),
                    a: rand(0.03, 0.075),
                });
            }
        }

        if (kind === 'clear') {
            for (let i = 0; i < 70; i++) {
                particles.push({
                    x: rand(0, W), y: rand(0, H * 0.85),
                    r: rand(0.5, 1.7),
                    tw: rand(0.006, 0.024),
                    phase: rand(0, Math.PI * 2),
                });
            }
        }
    }

    /* ---------------- drawing ---------------- */

    function draw() {
        ctx.clearRect(0, 0, W, H);
        const kind = current;

        if (kind === 'rain' || kind === 'drizzle' || kind === 'thunder') {
            ctx.lineCap = 'round';
            ctx.lineWidth = 1.1;
            for (const p of particles) {
                ctx.strokeStyle = `rgba(174, 204, 238, ${p.a})`;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + p.vx * 2, p.y + p.len);
                ctx.stroke();
                p.x += p.vx;
                p.y += p.vy;
                if (p.y > H) { p.y = rand(-70, -6); p.x = rand(0, W); }
            }

            if (kind === 'thunder') {
                if (--nextFlash <= 0) { flashAlpha = 0.5; nextFlash = rand(220, 620); }
                if (flashAlpha > 0) {
                    ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
                    ctx.fillRect(0, 0, W, H);
                    flashAlpha -= 0.055;
                }
            }
        }

        else if (kind === 'snow') {
            for (const p of particles) {
                ctx.fillStyle = `rgba(255, 255, 255, ${p.a})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                p.phase += 0.012;
                p.x += Math.sin(p.phase) * p.drift * 0.45;
                p.y += p.vy;
                if (p.y > H) { p.y = -12; p.x = rand(0, W); }
            }
        }

        else if (kind === 'clouds' || kind === 'mist') {
            for (const p of particles) {
                const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
                g.addColorStop(0, `rgba(255, 255, 255, ${p.a})`);
                g.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                p.x += p.vx;
                if (p.x - p.r > W) p.x = -p.r;
            }
        }

        else if (kind === 'clear') {
            for (const p of particles) {
                p.phase += p.tw;
                const a = 0.2 + Math.abs(Math.sin(p.phase)) * 0.55;
                ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    function pause()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
    function resume() { if (!rafId && !reduceMotion && canvas) loop(); }

    /* ---------------- public API ---------------- */

    function setCondition(raw) {
        const map = {
            rain: 'rain', drizzle: 'drizzle', thunderstorm: 'thunder',
            snow: 'snow', clouds: 'clouds', clear: 'clear',
            mist: 'mist', haze: 'mist', fog: 'mist', smoke: 'mist',
            dust: 'mist', sand: 'mist', ash: 'mist',
            squall: 'rain', tornado: 'rain',
        };
        const kind = map[String(raw || '').toLowerCase()] || 'clouds';
        current = kind;
        document.body.dataset.weather = kind;

        if (reduceMotion) { pause(); return; }
        if (!ensureCanvas()) return;
        build(kind);
        resume();
    }

    // sunrise/sunset are UNIX seconds (UTC); tzOffset is the city's offset in seconds
    function setTimeTheme(sunrise, sunset, tzOffset = 0) {
        const now = Math.floor(Date.now() / 1000);
        let phase;

        if (sunrise && sunset) {
            const dawnEnd = sunrise + 45 * 60;
            const duskStart = sunset - 45 * 60;
            const duskEnd = sunset + 45 * 60;

            if (now < sunrise - 45 * 60) phase = 'night';
            else if (now < dawnEnd)      phase = 'dawn';
            else if (now < duskStart)    phase = 'day';
            else if (now < duskEnd)      phase = 'dusk';
            else                         phase = 'night';
        } else {
            const h = new Date((now + tzOffset) * 1000).getUTCHours();
            phase = h < 6 ? 'night' : h < 8 ? 'dawn' : h < 18 ? 'day' : h < 20 ? 'dusk' : 'night';
        }

        const palettes = {
            dawn:  { a: '#3b1f47', b: '#7a3b52', accent: '#ffb27d' },
            day:   { a: '#0f2b52', b: '#12456b', accent: '#7dd3fc' },
            dusk:  { a: '#2a1740', b: '#6b2f4a', accent: '#ffa07a' },
            night: { a: '#080c1c', b: '#131f3a', accent: '#9ec5ff' },
        };

        const p = palettes[phase];
        const root = document.documentElement.style;
        root.setProperty('--tint-a', p.a);
        root.setProperty('--tint-b', p.b);
        root.setProperty('--accent', p.accent);
        document.body.dataset.phase = phase;

        return phase;
    }

    return { setCondition, setTimeTheme, pause, resume };
})();

window.WeatherFX = WeatherFX;
