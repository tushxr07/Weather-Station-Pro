class WeatherStation {
    constructor() {
        this.apiKey = '8c7e43457708ad179e50dff631c08d86'; 
        this.baseUrl = 'https://api.openweathermap.org/data/2.5';
        this.geoUrl = 'https://api.openweathermap.org/geo/1.0';
        this.currentWeatherData = null;
        this.demoNoticeShown = false;
        this.init();
    }

    init() {
        this.updateDateTime();
        this.setupEventListeners();
        this.startDateTimeUpdater();
        
        if (this.apiKey === 'your_openweathermap_api_key') {
            this.showDemoData();
        }
    }

    setupEventListeners() {
        const cityInput = document.getElementById('cityInput');
        
        cityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchWeather();
            }
        });

        cityInput.addEventListener('focus', () => {
            cityInput.parentElement.classList.add('focused');
        });

        cityInput.addEventListener('blur', () => {
            cityInput.parentElement.classList.remove('focused');
        });
    }

    async searchWeather() {
        const cityInput = document.getElementById('cityInput');
        const city = cityInput.value.trim();
        
        if (!city) {
            this.showError('Please enter a city name');
            return;
        }

        try {
            this.showLoading();
            
            if (this.apiKey === 'your_openweathermap_api_key') {
                this.showDemoData(city);
                return;
            }

            const coordinates = await this.getCoordinates(city);
            const weatherData = await this.getWeatherData(coordinates.lat, coordinates.lon);
            
            this.displayWeatherData(weatherData, city);
            this.hideError();
            
        } catch (error) {
            console.error('Error fetching weather:', error);
            this.showError('Unable to fetch weather data. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    async getCurrentLocation() {
        if (!navigator.geolocation) {
            this.showError('Geolocation is not supported by your browser');
            return;
        }

        try {
            this.showLoading();
            
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 300000
                });
            });

            const { latitude, longitude } = position.coords;
            
            if (this.apiKey === 'your_openweathermap_api_key') {
                this.showDemoData('Your Location');
                return;
            }

            const weatherData = await this.getWeatherData(latitude, longitude);
            const cityName = await this.getCityName(latitude, longitude);
            
            this.displayWeatherData(weatherData, cityName);
            this.hideError();
            
        } catch (error) {
            console.error('Geolocation error:', error);
            let errorMessage = 'Unable to get your location. ';
            
            if (error.code === 1) {
                errorMessage += 'Please allow location access.';
            } else if (error.code === 2) {
                errorMessage += 'Location unavailable.';
            } else {
                errorMessage += 'Location request timed out.';
            }
            
            this.showError(errorMessage);
        } finally {
            this.hideLoading();
        }
    }

    async quickSearch(city) {
        document.getElementById('cityInput').value = city;
        await this.searchWeather();
    }

    async getCoordinates(city) {
        const response = await fetch(`${this.geoUrl}/direct?q=${encodeURIComponent(city)}&limit=1&appid=${this.apiKey}`);
        
        if (!response.ok) {
            throw new Error('Failed to get coordinates');
        }
        
        const data = await response.json();
        
        if (data.length === 0) {
            throw new Error('City not found');
        }
        
        return {
            lat: data[0].lat,
            lon: data[0].lon,
            name: data[0].name,
            country: data[0].country
        };
    }

    async getCityName(lat, lon) {
        try {
            const response = await fetch(`${this.geoUrl}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${this.apiKey}`);
            const data = await response.json();
            
            if (data.length > 0) {
                return `${data[0].name}, ${data[0].country}`;
            }
        } catch (error) {
            console.error('Error getting city name:', error);
        }
        
        return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    }

    async getWeatherData(lat, lon) {
        const [current, forecast] = await Promise.all([
            fetch(`${this.baseUrl}/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`),
            fetch(`${this.baseUrl}/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`)
        ]);

        if (!current.ok || !forecast.ok) {
            throw new Error('Failed to fetch weather data');
        }

        const currentData = await current.json();
        const forecastData = await forecast.json();

        return {
            current: currentData,
            forecast: forecastData
        };
    }

    displayWeatherData(data, cityName) {
        this.currentWeatherData = { ...data, cityName }; 
        
        document.getElementById('cityName').textContent = cityName;
        document.getElementById('mainTemp').textContent = `${Math.round(data.current.main.temp)}°`;
        document.getElementById('mainIcon').textContent = this.getWeatherIcon(data.current.weather[0].id, data.current.weather[0].icon);
        document.getElementById('weatherDesc').textContent = data.current.weather[0].description;
        
        document.getElementById('windSpeed').textContent = `${data.current.wind.speed.toFixed(1)} m/s`;
        document.getElementById('humidity').textContent = `${data.current.main.humidity}%`;
        document.getElementById('visibility').textContent = `${(data.current.visibility / 1000).toFixed(1)} km`;
        document.getElementById('feelsLike').textContent = `${Math.round(data.current.main.feels_like)}°`;
        
        this.displayHourlyForecast(data.forecast);
        
        this.displayWeeklyForecast(data.forecast);
        
        this.displayAirQuality();
        
        document.getElementById('weatherContent').classList.remove('hidden');
    }

    displayHourlyForecast(forecastData) {
        const hourlyContainer = document.getElementById('hourlyItems');
        hourlyContainer.innerHTML = '';
        
        const hourlyData = forecastData.list.slice(0, 8);
        
        hourlyData.forEach(item => {
            const time = new Date(item.dt * 1000);
            const hourlyItem = document.createElement('div');
            hourlyItem.className = 'hourly-item';
            
            hourlyItem.innerHTML = `
                <div class="hourly-time">${time.getHours()}:00</div>
                <div class="hourly-icon">${this.getWeatherIcon(item.weather[0].id, item.weather[0].icon)}</div>
                <div class="hourly-temp">${Math.round(item.main.temp)}°</div>
            `;
            
            hourlyContainer.appendChild(hourlyItem);
        });
    }

    displayWeeklyForecast(forecastData) {
        const weeklyContainer = document.getElementById('weeklyForecast');
        weeklyContainer.innerHTML = '';
        
        
        const dailyForecasts = {};
        
        forecastData.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const dateKey = date.toDateString();
            
            if (!dailyForecasts[dateKey]) {
                dailyForecasts[dateKey] = {
                    date: date,
                    temps: [],
                    weather: item.weather[0],
                    items: []
                };
            }
            
            dailyForecasts[dateKey].temps.push(item.main.temp);
            dailyForecasts[dateKey].items.push(item);
        });
        
        
        Object.values(dailyForecasts).slice(0, 7).forEach(day => {
            const minTemp = Math.round(Math.min(...day.temps));
            const maxTemp = Math.round(Math.max(...day.temps));
            
            const forecastDay = document.createElement('div');
            forecastDay.className = 'forecast-day';
            
            const dayName = day.date.toLocaleDateString('en-US', { weekday: 'short' });
            
            forecastDay.innerHTML = `
                <div class="day-name">${dayName}</div>
                <div class="day-icon">${this.getWeatherIcon(day.weather.id, day.weather.icon)}</div>
                <div class="day-temps">
                    <span class="temp-high">${maxTemp}°</span>
                    <span class="temp-low">${minTemp}°</span>
                </div>
            `;
            
            weeklyContainer.appendChild(forecastDay);
        });
    }

    displayAirQuality() {
    
        let aqiValue;
        if (this.currentWeatherData && this.currentWeatherData.cityName) {
            const cityHash = this.hashString(this.currentWeatherData.cityName);
            aqiValue = 25 + (cityHash % 75); 
        } else {
            aqiValue = Math.floor(Math.random() * 100) + 20;
        }
        
        let aqiStatus, aqiDesc, aqiClass;
        
        if (aqiValue <= 50) {
            aqiStatus = 'Good';
            aqiDesc = 'Air quality is satisfactory';
            aqiClass = 'aqi-good';
        } else if (aqiValue <= 100) {
            aqiStatus = 'Moderate';
            aqiDesc = 'Air quality is acceptable';
            aqiClass = 'aqi-moderate';
        } else {
            aqiStatus = 'Poor';
            aqiDesc = 'Air quality may affect health';
            aqiClass = 'aqi-poor';
        }
        
        const aqiCircle = document.getElementById('aqiCircle');
        aqiCircle.textContent = aqiValue;
        aqiCircle.className = `aqi-circle ${aqiClass}`;
        
        document.getElementById('aqiStatus').textContent = aqiStatus;
        document.getElementById('aqiDesc').textContent = aqiDesc;
    }

    getWeatherIcon(conditionId, iconCode) {
        
        const iconMap = {
        
            800: '☀️',
            
            
            801: '🌤️', 802: '⛅', 803: '🌥️', 804: '☁️',
            
            
            500: '🌦️', 501: '🌧️', 502: '⛈️', 503: '⛈️', 504: '⛈️',
            520: '🌦️', 521: '🌧️', 522: '🌧️', 531: '🌧️',
            300: '🌦️', 301: '🌦️', 302: '🌦️', 310: '🌦️',
            311: '🌦️', 312: '🌦️', 313: '🌦️', 314: '🌦️', 321: '🌦️',
            
            
            200: '⛈️', 201: '⛈️', 202: '⛈️', 210: '🌩️', 211: '🌩️',
            212: '⛈️', 221: '🌩️', 230: '⛈️', 231: '⛈️', 232: '⛈️',
            
            
            600: '🌨️', 601: '❄️', 602: '❄️', 611: '🌨️', 612: '🌨️',
            613: '🌨️', 615: '🌨️', 616: '🌨️', 620: '🌨️', 621: '❄️', 622: '❄️',
            
        
            701: '🌫️', 711: '💨', 721: '🌫️', 731: '💨', 741: '🌫️',
            751: '💨', 761: '💨', 762: '🌋', 771: '💨', 781: '🌪️'
        };
        
        return iconMap[conditionId] || '🌤️';
    }

    showDemoData(city = 'Demo City') {
    
        const cityHash = this.hashString(city);
        const baseTemp = 15 + (cityHash % 20); 
        const conditions = [800, 801, 802, 500, 501, 600, 701]; 
        const conditionId = conditions[cityHash % conditions.length];
        
        const demoData = {
            current: {
                weather: [{ 
                    id: conditionId, 
                    icon: '01d', 
                    description: this.getWeatherDescription(conditionId)
                }],
                main: {
                    temp: baseTemp + (Math.random() * 6 - 3),
                    feels_like: baseTemp + (Math.random() * 4 - 2),
                    humidity: 40 + (cityHash % 40) 
                },
                wind: { speed: 1 + (cityHash % 8) / 2 }, 
                visibility: 8000 + (cityHash % 5000) 
            },
            forecast: {
                list: [
                    ...Array.from({ length: 8 }, (_, i) => ({
                        dt: (Date.now() / 1000) + (i * 3600),
                        main: { temp: baseTemp + Math.sin(i * 0.5) * 3 + (Math.random() * 4 - 2) },
                        weather: [{ 
                            id: conditions[(cityHash + i) % conditions.length], 
                            icon: '01d' 
                        }]
                    })),
                    ...Array.from({ length: 32 }, (_, i) => {
                        const dayOffset = Math.floor(i / 8);
                        const dailyVariation = Math.sin(dayOffset * 0.3) * 5;
                        return {
                            dt: (Date.now() / 1000) + ((i + 8) * 3600),
                            main: { temp: baseTemp + dailyVariation + (Math.random() * 8 - 4) },
                            weather: [{ 
                                id: conditions[(cityHash + i + dayOffset) % conditions.length], 
                                icon: '01d' 
                            }]
                        };
                    })
                ]
            }
        };

        setTimeout(() => {
            this.displayWeatherData(demoData, city);
            this.hideLoading();
            
            if (!this.demoNoticeShown) {
            this.displayWeatherData(demoData, city);
            this.hideLoading();
            }
        }, 1000);
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; 
        }
        return Math.abs(hash);
    }

    getWeatherDescription(conditionId) {
        const descriptions = {
            800: 'clear sky',
            801: 'few clouds',
            802: 'scattered clouds',
            500: 'light rain',
            501: 'moderate rain',
            600: 'light snow',
            701: 'mist'
        };
        return descriptions[conditionId] || 'clear sky';
    }

    showNotice(message) {
   
        const notice = document.createElement('div');
        notice.className = 'demo-notice';
        notice.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4ade80, #16a34a);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            font-size: 14px;
            max-width: 300px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        notice.textContent = message;
        document.body.appendChild(notice);

        setTimeout(() => {
            notice.remove();
        }, 5000);
    }

    updateDateTime() {
        const now = new Date();
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        document.getElementById('currentDateTime').textContent = 
            now.toLocaleDateString('en-US', options);
    }

    startDateTimeUpdater() {
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 60000); 
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('weatherContent').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        const errorElement = document.getElementById('error');
        errorElement.querySelector('p').textContent = message;
        errorElement.classList.remove('hidden');
        document.getElementById('weatherContent').classList.add('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }
}

function searchWeather() {
    weatherStation.searchWeather();
}

function getCurrentLocation() {
    weatherStation.getCurrentLocation();
}

function quickSearch(city) {
    weatherStation.quickSearch(city);
}

let weatherStation;

document.addEventListener('DOMContentLoaded', () => {
    weatherStation = new WeatherStation();
});


document.addEventListener('DOMContentLoaded', () => {

    const buttons = document.querySelectorAll('.btn, .quick-city');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px) scale(1.02)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
        });
    });

    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.5);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
            `;
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
});

const rippleStyles = document.createElement('style');
rippleStyles.textContent = `
    @keyframes ripple {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
`;

document.head.appendChild(rippleStyles);

