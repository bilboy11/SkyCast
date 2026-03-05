const apiKey = "affdbceb55196fa0154c369ff0593d00";
let currentUnit = "metric";
let currentCity = "";

// ==========================
// DOM ELEMENTS
// ==========================
const searchBtn = document.getElementById("searchBtn");
const locationBtn = document.getElementById("locationBtn");
const cityInput = document.getElementById("cityInput");
const loading = document.getElementById("loading");
const weatherCard = document.getElementById("weatherCard");
const errorDiv = document.getElementById("error");
const historySection = document.getElementById("historySection");
const cacheIndicator = document.getElementById("cacheIndicator");

const cityName = document.getElementById("cityName");
const temperature = document.getElementById("temperature");
const description = document.getElementById("description");
const humidity = document.getElementById("humidity");
const wind = document.getElementById("wind");
const pressure = document.getElementById("pressure");
const feelsLike = document.getElementById("feelsLike");
const weatherIcon = document.getElementById("weatherIcon");

const historyList = document.getElementById("historyList");
const celsiusBtn = document.getElementById("celsiusBtn");
const fahrenheitBtn = document.getElementById("fahrenheitBtn");
const forecastSection = document.getElementById("forecastSection");
const forecastContainer = document.getElementById("forecastContainer");
const hourlyForecastSection = document.getElementById("hourlyForecastSection");
const hourlyForecastContainer = document.getElementById("hourlyForecastContainer");
const currentTime = document.getElementById("currentTime");
const currentDate = document.getElementById("currentDate");
const sunrise = document.getElementById("sunrise");
const sunset = document.getElementById("sunset");
const windDirection = document.getElementById("windDirection");

// Radar map elements
const radarSection = document.getElementById("radarSection");
const toggleRadarBtn = document.getElementById("toggleRadarBtn");
const radarControls = document.getElementById("radarControls");
const mapContainer = document.getElementById("mapContainer");
const rainRadarBtn = document.getElementById("rainRadarBtn");
const cloudRadarBtn = document.getElementById("cloudRadarBtn");
const tempRadarBtn = document.getElementById("tempRadarBtn");
const closeRadarBtn = document.getElementById("closeRadarBtn");

let timeUpdateInterval = null;
let currentTimezone = null;

// Cache configuration
const CACHE_CONFIG = {
  CURRENT_WEATHER_TTL: 15 * 60 * 1000, // 15 minutes
  FORECAST_TTL: 60 * 60 * 1000, // 1 hour
  HOURLY_FORECAST_TTL: 30 * 60 * 1000, // 30 minutes
  CACHE_PREFIX: 'weather_cache_'
};

// Map variables
let map = null;
let currentLayer = null;
let rainLayer = null;
let cloudLayer = null;
let tempLayer = null;
let currentMarker = null;
let currentLat = null;
let currentLon = null;

// Search by city
searchBtn.addEventListener("click", () => {
  const city = cityInput.value.trim();
  if (city) {
    getWeather(city);
    saveToHistory(city);
  } else {
    showError("Please enter a city name");
  }
});

// Enter key support
cityInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    searchBtn.click();
  }
});

// Temperature toggle
celsiusBtn.addEventListener("click", () => {
  currentUnit = "metric";
  celsiusBtn.classList.add("active");
  fahrenheitBtn.classList.remove("active");
  if (currentCity) {
    getWeather(currentCity);
    getForecast(currentCity);
  }
});

fahrenheitBtn.addEventListener("click", () => {
  currentUnit = "imperial";
  fahrenheitBtn.classList.add("active");
  celsiusBtn.classList.remove("active");
  if (currentCity) {
    getWeather(currentCity);
    getForecast(currentCity);
  }
});

// Geolocation
locationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError("Geolocation not supported by your browser.");
    return;
  }

  locationBtn.disabled = true;
  locationBtn.textContent = "📍 Getting location...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      getWeatherByCoords(lat, lon);
      locationBtn.disabled = false;
      locationBtn.textContent = "📍 My Location";
    },
    (error) => {
      showError("Location access denied or unavailable.");
      locationBtn.disabled = false;
      locationBtn.textContent = "📍 My Location";
    }
  );
});

// ==========================
// CACHE FUNCTIONS
// ==========================

function getCacheKey(type, identifier, unit) {
  return `${CACHE_CONFIG.CACHE_PREFIX}${type}_${identifier}_${unit}`;
}

function saveToCache(key, data, ttl) {
  try {
    const cacheData = {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Failed to save to cache:', error);
  }
}

function getFromCache(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);
    const age = Date.now() - cacheData.timestamp;

    // Check if cache is expired
    if (age > cacheData.ttl) {
      localStorage.removeItem(key);
      return null;
    }

    return cacheData.data;
  } catch (error) {
    console.warn('Failed to read from cache:', error);
    return null;
  }
}

function clearExpiredCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_CONFIG.CACHE_PREFIX)) {
        const cached = localStorage.getItem(key);
        if (cached) {
          try {
            const cacheData = JSON.parse(cached);
            const age = Date.now() - cacheData.timestamp;
            if (age > cacheData.ttl) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // Invalid cache entry, remove it
            localStorage.removeItem(key);
          }
        }
      }
    });
  } catch (error) {
    console.warn('Failed to clear expired cache:', error);
  }
}

function isOnline() {
  return navigator.onLine;
}

function showCacheIndicator() {
  if (cacheIndicator) {
    cacheIndicator.classList.remove("hidden");
  }
}

function hideCacheIndicator() {
  if (cacheIndicator) {
    cacheIndicator.classList.add("hidden");
  }
}

// ==========================
// API FUNCTIONS
// ==========================

async function getWeather(city) {
  const cacheKey = getCacheKey('current', city.toLowerCase(), currentUnit);
  
  // Try to get from cache first if offline or as fallback
  if (!isOnline()) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      hideError();
      showCacheIndicator();
      displayWeather(cachedData);
      // Try to get cached forecast too
      const forecastCacheKey = getCacheKey('forecast', city.toLowerCase(), currentUnit);
      const cachedForecast = getFromCache(forecastCacheKey);
      if (cachedForecast) {
        displayForecast(cachedForecast);
        displayHourlyForecast(cachedForecast);
      }
      hideLoading();
      return;
    } else {
      showError("No internet connection and no cached data available.");
      hideLoading();
      return;
    }
  }

  try {
    hideError();
    hideCacheIndicator();
    showLoading();
    currentCity = city;

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=${currentUnit}&appid=${apiKey}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "City not found");
    }

    // Save to cache
    saveToCache(cacheKey, data, CACHE_CONFIG.CURRENT_WEATHER_TTL);
    
    displayWeather(data);
    getForecast(city);

  } catch (error) {
    // Try to use cached data as fallback
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      hideError();
      showCacheIndicator();
      displayWeather(cachedData);
      // Try to get cached forecast too
      const forecastCacheKey = getCacheKey('forecast', city.toLowerCase(), currentUnit);
      const cachedForecast = getFromCache(forecastCacheKey);
      if (cachedForecast) {
        displayForecast(cachedForecast);
        displayHourlyForecast(cachedForecast);
      }
    } else {
      showError("Error: " + error.message + (isOnline() ? "" : " (Offline - no cached data)"));
      weatherCard.classList.add("hidden");
      forecastSection.classList.add("hidden");
    }
  } finally {
    hideLoading();
  }
}

async function getWeatherByCoords(lat, lon) {
  const cacheKey = getCacheKey('coords', `${lat}_${lon}`, currentUnit);
  
  // Try to get from cache first if offline
  if (!isOnline()) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      hideError();
      showCacheIndicator();
      currentCity = cachedData.name;
      displayWeather(cachedData);
      saveToHistory(cachedData.name);
      // Try to get cached forecast too
      const forecastCacheKey = getCacheKey('forecast_coords', `${lat}_${lon}`, currentUnit);
      const cachedForecast = getFromCache(forecastCacheKey);
      if (cachedForecast) {
        displayForecast(cachedForecast);
        displayHourlyForecast(cachedForecast);
      }
      // Update map location
      if (!map) {
        initializeMap(lat, lon);
      } else {
        updateMapLocation(lat, lon);
      }
      hideLoading();
      return;
    } else {
      showError("No internet connection and no cached data available.");
      hideLoading();
      return;
    }
  }

  try {
    hideError();
    hideCacheIndicator();
    showLoading();

    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${apiKey}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Weather data unavailable");
    }

    // Save to cache
    saveToCache(cacheKey, data, CACHE_CONFIG.CURRENT_WEATHER_TTL);

    currentCity = data.name;
    displayWeather(data);
    saveToHistory(data.name);
    getForecastByCoords(lat, lon);
    
    // Update map location
    if (!map) {
      initializeMap(lat, lon);
    } else {
      updateMapLocation(lat, lon);
    }

  } catch (error) {
    // Try to use cached data as fallback
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      hideError();
      showCacheIndicator();
      currentCity = cachedData.name;
      displayWeather(cachedData);
      saveToHistory(cachedData.name);
      // Try to get cached forecast too
      const forecastCacheKey = getCacheKey('forecast_coords', `${lat}_${lon}`, currentUnit);
      const cachedForecast = getFromCache(forecastCacheKey);
      if (cachedForecast) {
        displayForecast(cachedForecast);
        displayHourlyForecast(cachedForecast);
      }
      // Update map location
      if (!map) {
        initializeMap(lat, lon);
      } else {
        updateMapLocation(lat, lon);
      }
    } else {
      showError("Error: " + error.message + (isOnline() ? "" : " (Offline - no cached data)"));
      weatherCard.classList.add("hidden");
      forecastSection.classList.add("hidden");
    }
  } finally {
    hideLoading();
  }
}

// ==========================
// DISPLAY FUNCTION
// ==========================

function displayWeather(data) {
  cityName.textContent = data.name + ", " + (data.sys.country || "");
  
  const temp = Math.round(data.main.temp);
  temperature.textContent = `${temp}°${currentUnit === "metric" ? "C" : "F"}`;

  description.textContent = data.weather[0].description.charAt(0).toUpperCase() + 
                           data.weather[0].description.slice(1);
  
  humidity.textContent = data.main.humidity + "%";
  
  // Wind speed with proper units
  const windSpeed = currentUnit === "metric" 
    ? (data.wind.speed * 3.6).toFixed(1) + " km/h"  // Convert m/s to km/h
    : (data.wind.speed * 2.237).toFixed(1) + " mph"; // Convert m/s to mph
  wind.textContent = windSpeed;
  
  // Wind direction
  if (data.wind && data.wind.deg !== undefined) {
    const direction = getWindDirection(data.wind.deg);
    windDirection.innerHTML = `<span class="wind-arrow" style="transform: rotate(${data.wind.deg}deg)">→</span> <span class="wind-dir-text">${direction}</span>`;
  } else {
    windDirection.innerHTML = '';
  }
  
  pressure.textContent = data.main.pressure + " hPa";
  
  const feelsLikeTemp = Math.round(data.main.feels_like);
  feelsLike.textContent = `${feelsLikeTemp}°${currentUnit === "metric" ? "C" : "F"}`;

  weatherIcon.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
  weatherIcon.alt = data.weather[0].description;
  
  // Add animation class based on weather type
  weatherIcon.className = "weather-icon";
  const weatherMain = data.weather[0].main.toLowerCase();
  if (weatherMain.includes("rain") || weatherMain.includes("drizzle")) {
    weatherIcon.classList.add("rain-animation");
  } else if (weatherMain.includes("snow")) {
    weatherIcon.classList.add("snow-animation");
  } else if (weatherMain.includes("cloud")) {
    weatherIcon.classList.add("cloud-animation");
  } else if (weatherMain.includes("clear")) {
    weatherIcon.classList.add("sun-animation");
  } else if (weatherMain.includes("thunderstorm")) {
    weatherIcon.classList.add("thunder-animation");
  }

  // Display sunrise and sunset times
  currentTimezone = data.timezone; // Timezone offset in seconds
  displaySunTimes(data.sys.sunrise, data.sys.sunset);
  
  // Start time update
  startTimeUpdate();

  weatherCard.classList.remove("hidden");
  weatherCard.style.animation = "fadeIn 0.5s ease-in";

  changeBackground(data.weather[0].main);

  // Initialize map with current location
  if (data.coord) {
    if (!map) {
      initializeMap(data.coord.lat, data.coord.lon);
    } else {
      updateMapLocation(data.coord.lat, data.coord.lon);
    }
    // Show radar section (map stays hidden until user clicks toggle)
    radarSection.classList.remove("hidden");
  }
}

// ==========================
// LOADING FUNCTIONS
// ==========================

function showLoading() {
  loading.classList.remove("hidden");
  weatherCard.classList.add("hidden");
  errorDiv.classList.add("hidden");
}

function hideLoading() {
  loading.classList.add("hidden");
}

// ==========================
// ERROR HANDLING
// ==========================

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove("hidden");
  errorDiv.style.animation = "slideDown 0.3s ease-out";
}

function hideError() {
  errorDiv.classList.add("hidden");
}

// ==========================
// BACKGROUND CHANGER
// ==========================

function changeBackground(condition) {
  const body = document.body;
  let gradient = "";

  if (condition.includes("Cloud")) {
    gradient = "linear-gradient(135deg, #bdc3c7, #2c3e50)";
  } else if (condition.includes("Rain") || condition.includes("Drizzle")) {
    gradient = "linear-gradient(135deg, #4b79a1, #283e51)";
  } else if (condition.includes("Clear")) {
    gradient = "linear-gradient(135deg, #f7971e, #ffd200)";
  } else if (condition.includes("Snow")) {
    gradient = "linear-gradient(135deg, #e6dada, #274046)";
  } else if (condition.includes("Thunderstorm")) {
    gradient = "linear-gradient(135deg, #2c3e50, #000000)";
  } else if (condition.includes("Mist") || condition.includes("Fog")) {
    gradient = "linear-gradient(135deg, #95a5a6, #7f8c8d)";
  } else {
    gradient = "linear-gradient(135deg, #667eea, #764ba2)";
  }

  body.style.background = gradient;
}

// ==========================
// SEARCH HISTORY
// ==========================

function saveToHistory(city) {
  let history = JSON.parse(localStorage.getItem("weatherHistory")) || [];

  // Remove if already exists
  history = history.filter(item => item !== city);
  
  // Add to beginning
  history.unshift(city);
  
  // Keep only last 5
  if (history.length > 5) {
    history = history.slice(0, 5);
  }

  localStorage.setItem("weatherHistory", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  let history = JSON.parse(localStorage.getItem("weatherHistory")) || [];

  if (history.length === 0) {
    historySection.classList.add("hidden");
    return;
  }

  historySection.classList.remove("hidden");
  historyList.innerHTML = "";

  history.forEach(city => {
    const li = document.createElement("li");
    li.textContent = city;
    li.classList.add("history-item");

    li.addEventListener("click", () => {
      cityInput.value = city;
      getWeather(city);
    });

    historyList.appendChild(li);
  });
}

// ==========================
// 5-DAY FORECAST
// ==========================

async function getForecast(city) {
  const cacheKey = getCacheKey('forecast', city.toLowerCase(), currentUnit);
  
  // Try to get from cache first if offline
  if (!isOnline()) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      displayForecast(cachedData);
      displayHourlyForecast(cachedData);
      return;
    } else {
      console.warn("Forecast: No cached data available offline");
      return;
    }
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=${currentUnit}&appid=${apiKey}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Forecast unavailable");
    }

    // Save to cache
    saveToCache(cacheKey, data, CACHE_CONFIG.FORECAST_TTL);

    displayForecast(data);
    displayHourlyForecast(data);

  } catch (error) {
    console.error("Forecast error:", error);
    // Try to use cached data as fallback
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      displayForecast(cachedData);
      displayHourlyForecast(cachedData);
    } else {
      forecastSection.classList.add("hidden");
      hourlyForecastSection.classList.add("hidden");
    }
  }
}

async function getForecastByCoords(lat, lon) {
  const cacheKey = getCacheKey('forecast_coords', `${lat}_${lon}`, currentUnit);
  
  // Try to get from cache first if offline
  if (!isOnline()) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      displayForecast(cachedData);
      displayHourlyForecast(cachedData);
      return;
    } else {
      console.warn("Forecast: No cached data available offline");
      return;
    }
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${apiKey}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Forecast unavailable");
    }

    // Save to cache
    saveToCache(cacheKey, data, CACHE_CONFIG.FORECAST_TTL);

    displayForecast(data);
    displayHourlyForecast(data);

  } catch (error) {
    console.error("Forecast error:", error);
    // Try to use cached data as fallback
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      displayForecast(cachedData);
      displayHourlyForecast(cachedData);
    } else {
      forecastSection.classList.add("hidden");
      hourlyForecastSection.classList.add("hidden");
    }
  }
}

// ==========================
// WIND DIRECTION FUNCTION
// ==========================

function getWindDirection(degrees) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

// ==========================
// HOURLY FORECAST FUNCTION
// ==========================

function displayHourlyForecast(data) {
  if (!data || !data.list) {
    hourlyForecastSection.classList.add("hidden");
    return;
  }

  // Get first 8 forecasts (24 hours, since API returns 3-hour intervals)
  const hourlyForecasts = data.list.slice(0, 8);
  
  hourlyForecastContainer.innerHTML = "";

  hourlyForecasts.forEach((forecast, index) => {
    const date = new Date(forecast.dt * 1000);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const time = `${hours}:${minutes}`;
    
    // Format time display
    let timeDisplay = time;
    if (index === 0) {
      timeDisplay = "Now";
    } else {
      const hour = date.getHours();
      timeDisplay = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
    }
    
    const temp = Math.round(forecast.main.temp);
    const tempUnit = currentUnit === "metric" ? "C" : "F";
    const icon = forecast.weather[0].icon;
    const description = forecast.weather[0].description;
    
    // Wind direction
    const windDeg = forecast.wind && forecast.wind.deg !== undefined ? forecast.wind.deg : null;
    const windDir = windDeg !== null ? getWindDirection(windDeg) : '';
    const windSpeed = currentUnit === "metric" 
      ? (forecast.wind.speed * 3.6).toFixed(1) + " km/h"
      : (forecast.wind.speed * 2.237).toFixed(1) + " mph";
    
    // Precipitation probability (if available)
    const pop = forecast.pop !== undefined ? Math.round(forecast.pop * 100) : 0;

    const hourlyItem = document.createElement("div");
    hourlyItem.className = "hourly-item";
    hourlyItem.style.animationDelay = `${index * 0.05}s`;
    
    hourlyItem.innerHTML = `
      <div class="hourly-time">${timeDisplay}</div>
      <div class="hourly-icon-wrapper">
        <img src="https://openweathermap.org/img/wn/${icon}@2x.png" 
             alt="${description}" 
             class="hourly-icon" />
      </div>
      <div class="hourly-temp">${temp}°${tempUnit}</div>
      <div class="hourly-wind">
        ${windDeg !== null ? `<span class="hourly-wind-arrow" style="transform: rotate(${windDeg}deg)">→</span>` : ''}
        <span class="hourly-wind-speed">${windSpeed}</span>
      </div>
      ${pop > 0 ? `<div class="hourly-pop">${pop}%</div>` : '<div class="hourly-pop-empty"></div>'}
    `;

    hourlyForecastContainer.appendChild(hourlyItem);
  });

  hourlyForecastSection.classList.remove("hidden");
}

function displayForecast(data) {
  // Group forecasts by day
  const forecastsByDay = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  data.list.forEach(item => {
    const date = new Date(item.dt * 1000);
    const dayKey = date.toDateString();
    
    // Skip today, only show next 5 days
    if (date.toDateString() === today.toDateString()) {
      return;
    }

    if (!forecastsByDay[dayKey]) {
      forecastsByDay[dayKey] = [];
    }
    forecastsByDay[dayKey].push(item);
  });

  // Get one forecast per day (usually midday forecast)
  const dailyForecasts = [];
  Object.keys(forecastsByDay).slice(0, 5).forEach(dayKey => {
    const dayForecasts = forecastsByDay[dayKey];
    // Get the forecast closest to midday (12:00)
    const middayForecast = dayForecasts.reduce((closest, current) => {
      const currentHour = new Date(current.dt * 1000).getHours();
      const closestHour = new Date(closest.dt * 1000).getHours();
      const currentDiff = Math.abs(currentHour - 12);
      const closestDiff = Math.abs(closestHour - 12);
      return currentDiff < closestDiff ? current : closest;
    });
    dailyForecasts.push(middayForecast);
  });

  forecastContainer.innerHTML = "";

  dailyForecasts.forEach((forecast, index) => {
    const date = new Date(forecast.dt * 1000);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNumber = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    
    const temp = Math.round(forecast.main.temp);
    const tempUnit = currentUnit === "metric" ? "C" : "F";
    const icon = forecast.weather[0].icon;
    const description = forecast.weather[0].description;

    const forecastItem = document.createElement("div");
    forecastItem.className = "forecast-item";
    forecastItem.style.animationDelay = `${index * 0.1}s`;
    
    forecastItem.innerHTML = `
      <div class="forecast-date">
        <span class="forecast-day">${dayName}</span>
        <span class="forecast-date-num">${dayNumber} ${month}</span>
      </div>
      <div class="forecast-icon-wrapper">
        <img src="https://openweathermap.org/img/wn/${icon}@2x.png" 
             alt="${description}" 
             class="forecast-icon" />
      </div>
      <div class="forecast-temp">
        <span class="forecast-temp-high">${temp}°${tempUnit}</span>
      </div>
      <div class="forecast-desc">${description.charAt(0).toUpperCase() + description.slice(1)}</div>
    `;

    forecastContainer.appendChild(forecastItem);
  });

  forecastSection.classList.remove("hidden");
}

// ==========================
// TIME DISPLAY FUNCTIONS
// ==========================

function displaySunTimes(sunriseTimestamp, sunsetTimestamp) {
  if (!currentTimezone) return;

  // OpenWeatherMap returns timestamps in UTC Unix time
  // currentTimezone is offset in seconds from UTC
  // Create dates adjusted for the city's timezone
  const sunriseUTC = new Date(sunriseTimestamp * 1000);
  const sunsetUTC = new Date(sunsetTimestamp * 1000);
  
  // Adjust for timezone (timezone is in seconds, convert to milliseconds)
  const sunriseLocal = new Date(sunriseUTC.getTime() + (currentTimezone * 1000));
  const sunsetLocal = new Date(sunsetUTC.getTime() + (currentTimezone * 1000));

  // Format times
  const sunriseTime = formatTime(sunriseLocal);
  const sunsetTime = formatTime(sunsetLocal);

  sunrise.textContent = sunriseTime;
  sunset.textContent = sunsetTime;
}

function formatTime(date) {
  // Use UTC methods since date is already adjusted for timezone
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function updateCurrentTime() {
  if (!currentTimezone) return;

  // Get current UTC time
  const now = new Date();
  const utcTime = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  );
  
  // Convert to city's local time (currentTimezone is in seconds)
  const cityTime = new Date(utcTime + (currentTimezone * 1000));

  // Format time (using UTC methods since we've adjusted for timezone)
  const hours = cityTime.getUTCHours().toString().padStart(2, '0');
  const minutes = cityTime.getUTCMinutes().toString().padStart(2, '0');
  const seconds = cityTime.getUTCSeconds().toString().padStart(2, '0');
  
  currentTime.textContent = `${hours}:${minutes}:${seconds}`;

  // Format date
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  const dayName = days[cityTime.getUTCDay()];
  const day = cityTime.getUTCDate();
  const month = months[cityTime.getUTCMonth()];
  const year = cityTime.getUTCFullYear();
  
  currentDate.textContent = `${dayName}, ${day} ${month} ${year}`;
}

function startTimeUpdate() {
  // Clear existing interval if any
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
  }

  // Update immediately
  updateCurrentTime();

  // Update every second
  timeUpdateInterval = setInterval(updateCurrentTime, 1000);
}

function stopTimeUpdate() {
  if (timeUpdateInterval) {
    clearInterval(timeUpdateInterval);
    timeUpdateInterval = null;
  }
}

// ==========================
// PWA SERVICE WORKER REGISTRATION
// ==========================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((registration) => {
        console.log('ServiceWorker registration successful:', registration.scope);
        
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60000); // Check every minute
        
        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('New service worker available. Refresh to update.');
            }
          });
        });
      })
      .catch((error) => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}

// Handle install prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  // Optionally, show a custom install button
  showInstallButton();
});

function showInstallButton() {
  // Create install button if it doesn't exist
  let installBtn = document.getElementById('installBtn');
  if (!installBtn && deferredPrompt) {
    installBtn = document.createElement('button');
    installBtn.id = 'installBtn';
    installBtn.textContent = '📲 Install App';
    installBtn.className = 'install-button';
    installBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      background: rgba(102, 126, 234, 0.9);
      color: white;
      border: none;
      border-radius: 25px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    `;
    
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      deferredPrompt = null;
      installBtn.remove();
    });
    
    installBtn.addEventListener('mouseenter', () => {
      installBtn.style.transform = 'scale(1.05)';
      installBtn.style.background = 'rgba(118, 75, 162, 0.9)';
    });
    
    installBtn.addEventListener('mouseleave', () => {
      installBtn.style.transform = 'scale(1)';
      installBtn.style.background = 'rgba(102, 126, 234, 0.9)';
    });
    
    document.body.appendChild(installBtn);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (installBtn && installBtn.parentNode) {
        installBtn.style.opacity = '0';
        installBtn.style.transform = 'translateY(20px)';
        setTimeout(() => installBtn.remove(), 300);
      }
    }, 10000);
  }
}

// Handle app installed
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  deferredPrompt = null;
});

// Load history on page load
renderHistory();

// Clear expired cache on page load
clearExpiredCache();

// ==========================
// ONLINE/OFFLINE HANDLING
// ==========================

window.addEventListener('online', () => {
  console.log('Connection restored');
  hideCacheIndicator();
  // Optionally refresh current weather if we have a city
  if (currentCity) {
    // Small delay to ensure connection is stable
    setTimeout(() => {
      getWeather(currentCity);
    }, 500);
  }
});

window.addEventListener('offline', () => {
  console.log('Connection lost');
  if (currentCity) {
    // Try to show cached data
    const cacheKey = getCacheKey('current', currentCity.toLowerCase(), currentUnit);
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      showCacheIndicator();
      displayWeather(cachedData);
      const forecastCacheKey = getCacheKey('forecast', currentCity.toLowerCase(), currentUnit);
      const cachedForecast = getFromCache(forecastCacheKey);
      if (cachedForecast) {
        displayForecast(cachedForecast);
        displayHourlyForecast(cachedForecast);
      }
    }
  }
});

// ==========================
// RADAR MAP FUNCTIONS
// ==========================

function initializeMap(lat, lon) {
  if (map) {
    map.remove();
    map = null;
  }

  currentLat = lat;
  currentLon = lon;

  // Ensure map container is visible before initializing
  if (mapContainer.classList.contains("hidden")) {
    mapContainer.classList.remove("hidden");
  }

  // Small delay to ensure container is rendered
  setTimeout(() => {
    // Initialize map
    map = L.map(mapContainer, {
      center: [lat, lon],
      zoom: 7,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false
    });

    // Add base tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: 0
    }).addTo(map);

    // Add marker for current location
    if (currentMarker && map.hasLayer(currentMarker)) {
      map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon], {
      icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).addTo(map);
    currentMarker.bindPopup(`<b>${currentCity || 'Current Location'}</b>`).openPopup();

    // Initialize radar layers
    initializeRadarLayers();

    // Invalidate size to ensure proper rendering
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 100);

    // Show radar section
    radarSection.classList.remove("hidden");
  }, 50);
}

function initializeRadarLayers() {
  const apiKey = "affdbceb55196fa0154c369ff0593d00";
  
  // Rain radar layer (precipitation) - using correct OpenWeatherMap tile format
  rainLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
    attribution: '© OpenWeatherMap',
    opacity: 0.75,
    maxZoom: 19,
    minZoom: 2,
    tileSize: 256,
    zoomOffset: 0,
    crossOrigin: true,
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });

  // Cloud layer
  cloudLayer = L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
    attribution: '© OpenWeatherMap',
    opacity: 0.75,
    maxZoom: 19,
    minZoom: 2,
    tileSize: 256,
    zoomOffset: 0,
    crossOrigin: true,
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });

  // Temperature heat map layer
  tempLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, {
    attribution: '© OpenWeatherMap',
    opacity: 0.75,
    maxZoom: 19,
    minZoom: 2,
    tileSize: 256,
    zoomOffset: 0,
    crossOrigin: true,
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });
}

function switchRadarLayer(layerType) {
  if (!map) return;

  // Remove current layer
  if (currentLayer && map.hasLayer(currentLayer)) {
    map.removeLayer(currentLayer);
  }

  // Remove active class from all buttons
  rainRadarBtn.classList.remove("active");
  cloudRadarBtn.classList.remove("active");
  tempRadarBtn.classList.remove("active");

  // Add new layer based on type
  switch (layerType) {
    case "rain":
      currentLayer = rainLayer;
      rainRadarBtn.classList.add("active");
      break;
    case "clouds":
      currentLayer = cloudLayer;
      cloudRadarBtn.classList.add("active");
      break;
    case "temp":
      currentLayer = tempLayer;
      tempRadarBtn.classList.add("active");
      break;
    default:
      return;
  }

  if (currentLayer) {
    currentLayer.addTo(map);
    // Refresh the layer to ensure it displays
    map.invalidateSize();
  }
}

function showRadarMap() {
  if (!map && currentLat && currentLon) {
    initializeMap(currentLat, currentLon);
  }
  
  mapContainer.classList.remove("hidden");
  radarControls.classList.remove("hidden");
  toggleRadarBtn.textContent = "🗺️ Hide Map";
  
  // Invalidate map size after showing to ensure proper rendering
  if (map) {
    setTimeout(() => {
      map.invalidateSize();
      map.setView([currentLat, currentLon], map.getZoom(), { animate: false });
    }, 100);
  }
}

function hideRadarMap() {
  mapContainer.classList.add("hidden");
  radarControls.classList.add("hidden");
  toggleRadarBtn.textContent = "🗺️ Show Map";
  
  // Remove active class from all buttons
  rainRadarBtn.classList.remove("active");
  cloudRadarBtn.classList.remove("active");
  tempRadarBtn.classList.remove("active");
  
  // Remove current layer
  if (currentLayer && map) {
    map.removeLayer(currentLayer);
    currentLayer = null;
  }
}

// Radar event listeners
toggleRadarBtn.addEventListener("click", () => {
  if (mapContainer.classList.contains("hidden")) {
    // Show container first
    mapContainer.classList.remove("hidden");
    radarControls.classList.remove("hidden");
    toggleRadarBtn.textContent = "🗺️ Hide Map";
    
    if (!map && currentLat && currentLon) {
      initializeMap(currentLat, currentLon);
    } else if (map) {
      // Map exists, invalidate size after showing
      setTimeout(() => {
        if (map) {
          map.invalidateSize();
          map.setView([currentLat, currentLon], map.getZoom(), { animate: false });
        }
      }, 150);
    }
  } else {
    hideRadarMap();
  }
});

rainRadarBtn.addEventListener("click", () => {
  switchRadarLayer("rain");
});

cloudRadarBtn.addEventListener("click", () => {
  switchRadarLayer("clouds");
});

tempRadarBtn.addEventListener("click", () => {
  switchRadarLayer("temp");
});

closeRadarBtn.addEventListener("click", () => {
  hideRadarMap();
});

function updateMapLocation(lat, lon) {
  if (map) {
    map.setView([lat, lon], map.getZoom());
    
    // Update marker
    if (currentMarker) {
      map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lon], {
      icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).addTo(map);
    currentMarker.bindPopup(`<b>${currentCity || 'Current Location'}</b>`).openPopup();
  }
  
  currentLat = lat;
  currentLon = lon;
}
