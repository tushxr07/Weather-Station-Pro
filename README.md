# Weather Station Pro

A weather dashboard built without a framework. Current conditions, hourly and
seven-day forecasts, live air quality, and a background that shifts with the
searched city's own sunrise and sunset.

**[Live site →](https://tushxr07.github.io/Weather-Station-Pro/)**

## Features

- **Current conditions** — temperature, feels-like, wind, humidity, visibility
- **Hourly forecast** for the next 24 hours, in the searched city's local time
- **Seven-day outlook** with highs, lows and precipitation probability
- **Real air quality** from the OpenWeatherMap Air Pollution API, with a
  PM2.5 / PM10 / NO₂ / O₃ breakdown
- **Sun arc** showing how much of the day has passed between sunrise and sunset
- **Autocomplete search** with debounced geocoding, keyboard navigation, and
  quick-select shortcuts for frequently viewed cities
- **Geolocation** with graceful fallback when permission is denied
- **°C / °F toggle** that remembers your preference
- **Ten-minute cache** so repeat searches are instant and stay within API limits
- **Recent searches**, and the last city reloads automatically on return

## Implementation notes

**Times belong to the city, not the browser.** Every timestamp is computed from
the searched location's own UTC offset rather than the local clock, so searching
Tokyo from India shows Tokyo's hours. This is easy to get wrong and obvious once
you look for it — the first version had it backwards.

**Air quality is real data.** An earlier draft generated an AQI number from a
hash of the city name, which looked plausible and was completely fabricated.
It now comes from the Air Pollution API, and when that endpoint fails the card
says the data is unavailable rather than inventing a value.

**Weather effects are drawn, not downloaded.** `weather-fx.js` renders rain,
snow, drifting cloud and lightning to a canvas sized from the viewport, so
particle counts scale down on phones. It pauses when the tab is hidden and
respects `prefers-reduced-motion`.

**One request can't overwrite another.** Each load carries an incrementing
request id; a slow response for an earlier search is discarded rather than
replacing a newer one.

**Failures are specific.** Denied location permission, an unreachable service,
a rate limit and a misspelled city each produce a different message, because
"something went wrong" tells the user nothing about what to do next.

## Running it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 3000
```

## API key

The OpenWeatherMap key lives in `CONFIG.apiKey` at the top of `script.js`.
Replace it with your own from [openweathermap.org/api](https://openweathermap.org/api) —
the free tier covers everything this uses.

Because the site is static, the key is visible in the source. That's fine for a
free-tier demo key. If you fork this for anything real, move the calls behind a
serverless function so the key stays server-side.

## Structure

```
index.html      markup and layout
style.css       design system, dynamic theming, responsive rules
script.js       app logic — fetching, caching, rendering, state
weather-fx.js   canvas weather effects and time-of-day palette
```

## Tech

Vanilla JavaScript, CSS custom properties, Canvas API, Geolocation API,
localStorage, OpenWeatherMap (Current Weather, 5-day Forecast, Air Pollution
and Geocoding endpoints).
