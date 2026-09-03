/* =====================================================================
   Weather Station Pro
   ===================================================================== */

const CONFIG = {
    apiKey: '8c7e43457708ad179e50dff631c08d86',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    geoUrl: 'https://api.openweathermap.org/geo/1.0',
    cacheTtlMs: 10 * 60 * 1000,   // 10 minutes
    maxRecent: 5,
};

const STORE = {
    unit: 'wsp:unit',
    last: 'wsp:lastPlace',
    recent: 'wsp:recent',
    cache: 'wsp:cache:',
};

/* ---------- tiny helpers ---------- */

const $ = (id) => document.getElementById(id);

const debounce = (fn, ms) => {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
};

// localStorage can throw in private mode — never let that break the app.
const safeStore = {
    get(key) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
        catch { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
};

/* ---------- error type so we can show useful messages ---------- */

class AppError extends Error {
    constructor(message, kind = 'generic') {
        super(message);
        this.kind = kind;
    }
}

/* =====================================================================
   Main app
   ===================================================================== */

class WeatherStation {
    constructor() {
        this.unit = safeStore.get(STORE.unit) || 'metric';
        this.place = null;        // { lat, lon, label }
        this.data = null;         // { current, forecast, air }
        this.requestId = 0;       // guards against out-of-order responses
        this.clockTimer = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.applyUnitToggleUI();
        this.renderRecent();

        const last = safeStore.get(STORE.last);
        if (last && last.lat != null) {
            this.load(last);
        } else {
            this.load({ lat: 28.6139, lon: 77.2090, label: 'New Delhi, IN' });
        }
    }

    /* ---------------- events ---------------- */

    bindEvents() {
        const input = $('cityInput');

        $('searchBtn').addEventListener('click', () => this.searchByText());
        $('locationBtn').addEventListener('click', () => this.useMyLocation());
        $('retryBtn').addEventListener('click', () => {
            if (this.place) this.load(this.place, { force: true });
        });

        $('quickCities').addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-city');
            if (btn) this.searchByText(btn.dataset.city);
        });

        $('recentCities').addEventListener('click', (e) => {
            const btn = e.target.closest('.quick-city');
            if (!btn) return;
            this.load({
                lat: Number(btn.dataset.lat),
                lon: Number(btn.dataset.lon),
                label: btn.dataset.label,
            });
        });

        $('unitToggle').addEventListener('click', () => this.toggleUnit());

        input.addEventListener('input', debounce(() => this.fetchSuggestions(input.value), 300));
        input.addEventListener('keydown', (e) => this.handleSearchKeys(e));
        input.addEventListener('focus', () => { $('searchHint').style.opacity = '0'; });
        input.addEventListener('blur', () => {
            $('searchHint').style.opacity = input.value ? '0' : '';
            // delay so a click on a suggestion still registers
            setTimeout(() => this.closeSuggestions(), 150);
        });

        $('suggestions').addEventListener('mousedown', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            e.preventDefault();
            this.pickSuggestion(Number(li.dataset.index));
        });

        // "/" focuses search from anywhere
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== input) {
                e.preventDefault();
                input.focus();
                input.select();
            }
        });
    }

    handleSearchKeys(e) {
        const list = $('suggestions');
        const open = !list.classList.contains('hidden');
        const items = [...list.querySelectorAll('li')];

        if (e.key === 'Enter') {
            e.preventDefault();
            const active = list.querySelector('li.is-active');
            if (open && active) this.pickSuggestion(Number(active.dataset.index));
            else this.searchByText();
            return;
        }

        if (e.key === 'Escape') { this.closeSuggestions(); return; }
        if (!open || !items.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const cur = items.findIndex((li) => li.classList.contains('is-active'));
            const next = e.key === 'ArrowDown'
                ? (cur + 1) % items.length
                : (cur - 1 + items.length) % items.length;
            items.forEach((li) => li.classList.remove('is-active'));
            items[next].classList.add('is-active');
            items[next].scrollIntoView({ block: 'nearest' });
        }
    }

    /* ---------------- autocomplete ---------------- */

    async fetchSuggestions(query) {
        const q = query.trim();
        if (q.length < 2) return this.closeSuggestions();

        try {
            const res = await fetch(
                `${CONFIG.geoUrl}/direct?q=${encodeURIComponent(q)}&limit=5&appid=${CONFIG.apiKey}`
            );
            if (!res.ok) return this.closeSuggestions();

            const results = await res.json();
            if (!results.length) return this.closeSuggestions();

            this.suggestions = results.map((r) => ({
                lat: r.lat,
                lon: r.lon,
                label: [r.name, r.state, r.country].filter(Boolean).join(', '),
            }));
            this.renderSuggestions();
        } catch {
            this.closeSuggestions();
        }
    }

    renderSuggestions() {
        const list = $('suggestions');
        list.innerHTML = this.suggestions
            .map((s, i) => `<li role="option" data-index="${i}">
                    <span class="sg-pin">📍</span><span>${this.escape(s.label)}</span>
                </li>`)
            .join('');
        list.classList.remove('hidden');
        $('cityInput').setAttribute('aria-expanded', 'true');
    }

    closeSuggestions() {
        $('suggestions').classList.add('hidden');
        $('cityInput').setAttribute('aria-expanded', 'false');
    }

    pickSuggestion(index) {
        const place = this.suggestions?.[index];
        if (!place) return;
        $('cityInput').value = place.label;
        this.closeSuggestions();
        this.load(place);
    }

    /* ---------------- search entry points ---------------- */

    async searchByText(preset) {
        const input = $('cityInput');
        const city = (preset ?? input.value).trim();

        if (!city) {
            this.showError('Please enter a city name.');
            input.focus();
            return;
        }
        if (preset) input.value = preset;
        this.closeSuggestions();

        this.showSkeleton();
        try {
            const place = await this.geocode(city);
            await this.load(place);
        } catch (err) {
            this.handleError(err);
        }
    }

    async useMyLocation() {
        if (!navigator.geolocation) {
            this.showError('Geolocation is not supported by this browser.');
            return;
        }

        this.showSkeleton();
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 300000,
                });
            });

            const { latitude: lat, longitude: lon } = position.coords;
            const label = await this.reverseGeocode(lat, lon);
            $('cityInput').value = label;
            await this.load({ lat, lon, label });
        } catch (err) {
            if (err && typeof err.code === 'number') {
                const messages = {
                    1: 'Location access was denied. Allow it in your browser settings, or search by city name.',
                    2: 'Your location is currently unavailable. Try searching by city name.',
                    3: 'The location request timed out. Please try again.',
                };
                this.showError(messages[err.code] || 'Could not determine your location.');
            } else {
                this.handleError(err);
            }
        }
    }

    /* ---------------- geocoding ---------------- */

    async geocode(city) {
        const res = await fetch(
            `${CONFIG.geoUrl}/direct?q=${encodeURIComponent(city)}&limit=1&appid=${CONFIG.apiKey}`
        );
        if (res.status === 401) throw new AppError('API key rejected.', 'auth');
        if (!res.ok) throw new AppError('Geocoding request failed.', 'network');

        const data = await res.json();
        if (!data.length) throw new AppError(`No place found matching "${city}".`, 'notfound');

        const p = data[0];
        return {
            lat: p.lat,
            lon: p.lon,
            label: [p.name, p.state, p.country].filter(Boolean).join(', '),
        };
    }

    async reverseGeocode(lat, lon) {
        try {
            const res = await fetch(
                `${CONFIG.geoUrl}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${CONFIG.apiKey}`
            );
            const data = await res.json();
            if (data.length) {
                return [data[0].name, data[0].state, data[0].country].filter(Boolean).join(', ');
            }
        } catch { /* fall through */ }
        return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }

    /* ---------------- data loading ---------------- */

    async load(place, { force = false } = {}) {
        const id = ++this.requestId;
        this.place = place;
        this.showSkeleton();

        try {
            const bundle = await this.getBundle(place, force);
            if (id !== this.requestId) return;   // a newer search already won

            this.data = bundle;
            this.render();
            this.hideError();
            safeStore.set(STORE.last, place);
            this.pushRecent(place);
        } catch (err) {
            if (id === this.requestId) this.handleError(err);
        }
    }

    async getBundle(place, force) {
        const key = `${STORE.cache}${place.lat.toFixed(3)},${place.lon.toFixed(3)},${this.unit}`;

        if (!force) {
            const cached = safeStore.get(key);
            if (cached && Date.now() - cached.savedAt < CONFIG.cacheTtlMs) {
                this.fromCache = true;
                return cached.bundle;
            }
        }
        this.fromCache = false;

        const { lat, lon } = place;
        const qs = `lat=${lat}&lon=${lon}&appid=${CONFIG.apiKey}&units=${this.unit}`;

        const [currentRes, forecastRes, airRes] = await Promise.all([
            fetch(`${CONFIG.baseUrl}/weather?${qs}`),
            fetch(`${CONFIG.baseUrl}/forecast?${qs}`),
            fetch(`${CONFIG.baseUrl}/air_pollution?lat=${lat}&lon=${lon}&appid=${CONFIG.apiKey}`),
        ]);

        if (currentRes.status === 401) throw new AppError('API key rejected.', 'auth');
        if (currentRes.status === 429) throw new AppError('Rate limit reached.', 'ratelimit');
        if (!currentRes.ok || !forecastRes.ok) {
            throw new AppError('Weather service returned an error.', 'network');
        }

        const bundle = {
            current: await currentRes.json(),
            forecast: await forecastRes.json(),
            // air quality is a bonus — never fail the whole load over it
            air: airRes.ok ? await airRes.json() : null,
        };

        safeStore.set(key, { savedAt: Date.now(), bundle });
        return bundle;
    }

    /* ---------------- rendering ---------------- */

    render() {
        const { current, forecast, air } = this.data;
        const tz = current.timezone ?? 0;
        const deg = this.unit === 'metric' ? '°C' : '°F';

        $('cityName').textContent = this.place.label;
        $('mainTemp').textContent = `${Math.round(current.main.temp)}°`;
        $('mainIcon').textContent = this.icon(current.weather[0].id, current.dt, current.sys);
        $('weatherDesc').textContent = current.weather[0].description;

        $('windSpeed').textContent = this.unit === 'metric'
            ? `${current.wind.speed.toFixed(1)} m/s`
            : `${current.wind.speed.toFixed(1)} mph`;
        $('humidity').textContent = `${current.main.humidity}%`;
        $('visibility').textContent = current.visibility != null
            ? `${(current.visibility / 1000).toFixed(1)} km`
            : '—';
        $('feelsLike').textContent = `${Math.round(current.main.feels_like)}${deg}`;

        $('adviceStrip').textContent = this.advice(current);

        this.startClock(tz);
        this.renderSun(current.sys, tz);
        this.renderHourly(forecast, tz);
        this.renderWeekly(forecast, tz);
        this.renderAir(air);

        // background effects + time-of-day palette
        if (window.WeatherFX) {
            WeatherFX.setCondition(current.weather[0].main);
            WeatherFX.setTimeTheme(current.sys?.sunrise, current.sys?.sunset, tz);
        }

        this.hideSkeleton();
        $('weatherContent').classList.remove('hidden');
        $('weatherContent').classList.remove('fx-swap');
        void $('weatherContent').offsetWidth;    // restart the animation
        $('weatherContent').classList.add('fx-swap');

        if (this.fromCache) this.toast('Showing cached data from the last 10 minutes');
    }

    /* --- local time for the searched city, not the browser --- */
    cityTime(unixSeconds, tzOffsetSeconds) {
        return new Date((unixSeconds + tzOffsetSeconds) * 1000);
    }

    formatHour(unixSeconds, tz) {
        const d = this.cityTime(unixSeconds, tz);
        const h = d.getUTCHours();
        const suffix = h < 12 ? 'AM' : 'PM';
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        return `${hour12} ${suffix}`;
    }

    formatClock(unixSeconds, tz) {
        const d = this.cityTime(unixSeconds, tz);
        const h = d.getUTCHours();
        const m = String(d.getUTCMinutes()).padStart(2, '0');
        const suffix = h < 12 ? 'AM' : 'PM';
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        return `${hour12}:${m} ${suffix}`;
    }

    startClock(tz) {
        clearInterval(this.clockTimer);
        const tick = () => {
            const now = this.cityTime(Math.floor(Date.now() / 1000), tz);
            const opts = {
                weekday: 'long', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
            };
            $('currentDateTime').textContent =
                `${now.toLocaleString('en-US', opts)} local time`;
        };
        tick();
        this.clockTimer = setInterval(tick, 30000);
    }

    renderSun(sys, tz) {
        if (!sys?.sunrise || !sys?.sunset) return;

        const { sunrise, sunset } = sys;
        $('sunriseTime').textContent = this.formatClock(sunrise, tz);
        $('sunsetTime').textContent = this.formatClock(sunset, tz);

        const totalMin = Math.round((sunset - sunrise) / 60);
        $('dayLength').textContent = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;

        const now = Math.floor(Date.now() / 1000);
        const progress = Math.min(Math.max((now - sunrise) / (sunset - sunrise), 0), 1);

        const path = $('sunProgress');
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len * (1 - progress);

        const point = path.getPointAtLength(len * progress);
        $('sunDot').setAttribute('cx', point.x);
        $('sunDot').setAttribute('cy', point.y);
        $('sunDot').style.opacity = (progress > 0 && progress < 1) ? '1' : '0.35';
    }

    renderHourly(forecast, tz) {
        const container = $('hourlyItems');
        container.innerHTML = forecast.list.slice(0, 8).map((item) => `
            <div class="hourly-item">
                <div class="hourly-time">${this.formatHour(item.dt, tz)}</div>
                <div class="hourly-icon">${this.icon(item.weather[0].id, item.dt, null, item.sys?.pod)}</div>
                <div class="hourly-right">
                    ${item.pop ? `<span class="pop">💧${Math.round(item.pop * 100)}%</span>` : ''}
                    <span class="hourly-temp">${Math.round(item.main.temp)}°</span>
                </div>
            </div>`).join('');
    }

    renderWeekly(forecast, tz) {
        const days = {};

        forecast.list.forEach((item) => {
            const d = this.cityTime(item.dt, tz);
            const key = d.toISOString().slice(0, 10);

            if (!days[key]) {
                days[key] = { date: d, temps: [], pops: [], counts: {}, samples: [] };
            }
            days[key].temps.push(item.main.temp);
            days[key].pops.push(item.pop || 0);
            days[key].samples.push(item);

            // pick the most frequent condition of the day rather than the first
            const id = item.weather[0].id;
            days[key].counts[id] = (days[key].counts[id] || 0) + 1;
        });

        const html = Object.values(days).slice(0, 7).map((day, i) => {
            const dominantId = Number(
                Object.entries(day.counts).sort((a, b) => b[1] - a[1])[0][0]
            );
            const high = Math.round(Math.max(...day.temps));
            const low = Math.round(Math.min(...day.temps));
            const pop = Math.round(Math.max(...day.pops) * 100);
            const name = i === 0
                ? 'Today'
                : day.date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

            return `
                <div class="forecast-day" style="animation-delay:${i * 60}ms">
                    <div class="day-name">${name}</div>
                    <div class="day-icon">${this.icon(dominantId, null, null, 'd')}</div>
                    ${pop > 15 ? `<div class="day-pop">💧 ${pop}%</div>` : '<div class="day-pop"></div>'}
                    <div class="day-temps">
                        <span class="temp-high">${high}°</span>
                        <span class="temp-low">${low}°</span>
                    </div>
                </div>`;
        }).join('');

        $('weeklyForecast').innerHTML = html;
    }

    /* --- real air quality, from the Air Pollution API --- */
    renderAir(air) {
        const circle = $('aqiCircle');
        const entry = air?.list?.[0];

        if (!entry) {
            circle.textContent = '—';
            circle.className = 'aqi-circle aqi-unknown';
            $('aqiStatus').textContent = 'Unavailable';
            $('aqiDesc').textContent = 'Air quality data not available for this location.';
            $('aqiBreakdown').innerHTML = '';
            return;
        }

        // OpenWeatherMap returns an index from 1 (Good) to 5 (Very Poor)
        const scale = {
            1: ['Good', 'Air quality is satisfactory.', 'aqi-good'],
            2: ['Fair', 'Acceptable for most people.', 'aqi-fair'],
            3: ['Moderate', 'Sensitive groups should limit long outdoor activity.', 'aqi-moderate'],
            4: ['Poor', 'Reduce prolonged outdoor exertion.', 'aqi-poor'],
            5: ['Very Poor', 'Avoid outdoor activity where possible.', 'aqi-verypoor'],
        };

        const [status, desc, cls] = scale[entry.main.aqi] || scale[1];
        circle.textContent = entry.main.aqi;
        circle.className = `aqi-circle ${cls}`;
        $('aqiStatus').textContent = status;
        $('aqiDesc').textContent = desc;

        const c = entry.components;
        $('aqiBreakdown').innerHTML = [
            ['PM2.5', c.pm2_5], ['PM10', c.pm10],
            ['NO₂', c.no2], ['O₃', c.o3],
        ].map(([label, value]) => `
            <div class="aqi-metric">
                <span class="aqi-metric-label">${label}</span>
                <span class="aqi-metric-value">${Math.round(value)}<em>µg/m³</em></span>
            </div>`).join('');
    }

    /* ---------------- unit switching ---------------- */

    toggleUnit() {
        this.unit = this.unit === 'metric' ? 'imperial' : 'metric';
        safeStore.set(STORE.unit, this.unit);
        this.applyUnitToggleUI();
        if (this.place) this.load(this.place);
    }

    applyUnitToggleUI() {
        document.querySelectorAll('.unit-opt').forEach((el) => {
            el.classList.toggle('is-active', el.dataset.unit === this.unit);
        });
    }

    /* ---------------- recent searches ---------------- */

    pushRecent(place) {
        const list = (safeStore.get(STORE.recent) || [])
            .filter((p) => p.label !== place.label);
        list.unshift(place);
        safeStore.set(STORE.recent, list.slice(0, CONFIG.maxRecent));
        this.renderRecent();
    }

    renderRecent() {
        const list = safeStore.get(STORE.recent) || [];
        const row = $('recentRow');

        if (!list.length) { row.classList.add('hidden'); return; }
        row.classList.remove('hidden');

        $('recentCities').innerHTML = list.map((p) => `
            <button class="quick-city is-recent"
                    data-lat="${p.lat}" data-lon="${p.lon}"
                    data-label="${this.escape(p.label)}">
                ${this.escape(p.label.split(',')[0])}
            </button>`).join('');
    }

    /* ---------------- icons + advice ---------------- */

    icon(id, dt, sys, pod) {
        // decide day or night so we can swap sun for moon
        let night = false;
        if (pod) night = pod === 'n';
        else if (dt && sys?.sunrise && sys?.sunset) night = dt < sys.sunrise || dt > sys.sunset;

        if (id === 800) return night ? '🌙' : '☀️';
        if (id === 801) return night ? '☁️' : '🌤️';

        const map = {
            802: '⛅', 803: '🌥️', 804: '☁️',
            500: '🌦️', 501: '🌧️', 502: '🌧️', 503: '🌧️', 504: '🌧️',
            511: '🌨️', 520: '🌦️', 521: '🌧️', 522: '🌧️', 531: '🌧️',
            300: '🌦️', 301: '🌦️', 302: '🌧️', 310: '🌦️', 311: '🌧️',
            312: '🌧️', 313: '🌦️', 314: '🌧️', 321: '🌦️',
            200: '⛈️', 201: '⛈️', 202: '⛈️', 210: '🌩️', 211: '🌩️',
            212: '⛈️', 221: '🌩️', 230: '⛈️', 231: '⛈️', 232: '⛈️',
            600: '🌨️', 601: '❄️', 602: '❄️', 611: '🌨️', 612: '🌨️',
            613: '🌨️', 615: '🌨️', 616: '🌨️', 620: '🌨️', 621: '❄️', 622: '❄️',
            701: '🌫️', 711: '💨', 721: '🌫️', 731: '💨', 741: '🌫️',
            751: '💨', 761: '💨', 762: '🌋', 771: '💨', 781: '🌪️',
        };
        return map[id] || '🌤️';
    }

    advice(current) {
        const isMetric = this.unit === 'metric';
        const t = isMetric ? current.main.feels_like : (current.main.feels_like - 32) * 5 / 9;
        const id = current.weather[0].id;
        const wind = current.wind.speed;
        const parts = [];

        if (t <= 0) parts.push('Freezing — heavy coat, gloves and layers');
        else if (t <= 10) parts.push('Cold — a warm jacket is a good idea');
        else if (t <= 18) parts.push('Cool — light jacket or hoodie');
        else if (t <= 27) parts.push('Pleasant — normal clothes are fine');
        else if (t <= 35) parts.push('Hot — light fabrics and plenty of water');
        else parts.push('Very hot — stay in shade and hydrate often');

        if (id >= 200 && id < 300) parts.push('thunderstorms about, stay indoors if you can');
        else if (id >= 300 && id < 600) parts.push('carry an umbrella');
        else if (id >= 600 && id < 700) parts.push('snow expected, wear proper footwear');
        else if (id >= 700 && id < 800) parts.push('low visibility, drive carefully');
        else if (id === 800 && t > 27) parts.push('strong sun, sunscreen recommended');

        const windLimit = isMetric ? 10 : 22;
        if (wind > windLimit) parts.push('quite windy');

        return `💡 ${parts.join(' · ')}`;
    }

    /* ---------------- UI state ---------------- */

    showSkeleton() {
        $('skeleton').classList.remove('hidden');
        $('weatherContent').classList.add('hidden');
        $('error').classList.add('hidden');
    }

    hideSkeleton() {
        $('skeleton').classList.add('hidden');
    }

    showError(message) {
        this.hideSkeleton();
        $('errorMessage').textContent = message;
        $('error').classList.remove('hidden');
        $('weatherContent').classList.add('hidden');
    }

    hideError() {
        $('error').classList.add('hidden');
    }

    handleError(err) {
        console.error(err);
        const messages = {
            auth: 'The API key was rejected. It may be inactive or over its quota.',
            ratelimit: 'Too many requests right now. Please wait a minute and retry.',
            notfound: err.message,
            network: 'Could not reach the weather service. Check your connection.',
        };
        this.showError(messages[err?.kind] || 'Something went wrong while fetching the weather.');
    }

    toast(message) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = message;
        $('toastStack').appendChild(el);
        setTimeout(() => {
            el.classList.add('is-out');
            setTimeout(() => el.remove(), 400);
        }, 3200);
    }

    escape(str) {
        return String(str).replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[ch]));
    }
}

/* ---------------- boot ---------------- */

document.addEventListener('DOMContentLoaded', () => {
    window.weatherStation = new WeatherStation();
});
