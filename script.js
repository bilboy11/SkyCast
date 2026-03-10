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
const radarAnimationIndicator = document.getElementById("radarAnimationIndicator");

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
let radarAnimationInterval = null;
let radarFrameIndex = 0;

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
const updateUnit = (unit) => {
  currentUnit = unit;
  celsiusBtn.classList.toggle("active", unit === "metric");
  fahrenheitBtn.classList.toggle("active", unit === "imperial");
  if (currentCity) {
    getWeather(currentCity);
    getForecast(currentCity);
  }
};

celsiusBtn.addEventListener("click", () => updateUnit("metric"));
fahrenheitBtn.addEventListener("click", () => updateUnit("imperial"));

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

const toggleCacheIndicator = (show) => {
  if (cacheIndicator) cacheIndicator.classList.toggle("hidden", !show);
};

// ==========================
// API FUNCTIONS
// ==========================

async function getWeather(city) {
  const cacheKey = getCacheKey('current', city.toLowerCase(), currentUnit);
  
  // Try to get from cache first if offline or as fallback
  if (!isOnline()) {
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      showError("");
      toggleCacheIndicator(true);
      displayWeather(cachedData);
      // Try to get cached forecast too
      const forecastCacheKey = getCacheKey('forecast', city.toLowerCase(), currentUnit);
      const cachedForecast = getFromCache(forecastCacheKey);
      if (cachedForecast) {
        displayForecast(cachedForecast);
        displayHourlyForecast(cachedForecast);
      }
      toggleLoading(false);
      return;
    } else {
      showError("No internet connection and no cached data available.");
      toggleLoading(false);
      return;
    }
  }

  try {
    showError("");
    toggleCacheIndicator(false);
    toggleLoading(true);
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
      showError("");
      toggleCacheIndicator(true);
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
    toggleLoading(false);
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
      toggleLoading(false);
      return;
    } else {
      showError("No internet connection and no cached data available.");
      toggleLoading(false);
      return;
    }
  }

  try {
    showError("");
    toggleCacheIndicator(false);
    toggleLoading(true);

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
    toggleLoading(false);
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

const toggleLoading = (show) => {
  loading.classList.toggle("hidden", !show);
  if (show) {
    weatherCard.classList.add("hidden");
    errorDiv.classList.add("hidden");
  }
};

// ==========================
// ERROR HANDLING
// ==========================

const showError = (message) => {
  if (message) {
    errorDiv.textContent = message;
    errorDiv.style.animation = "slideDown 0.3s ease-out";
  }
  errorDiv.classList.toggle("hidden", !message);
};

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
  
  // Create radar layers with custom URL function for cache-busting animation
  const createAnimatedLayer = (layerType) => {
    return L.tileLayer(`https://tile.openweathermap.org/map/${layerType}/{z}/{x}/{y}.png?appid=${apiKey}`, {
      attribution: '© OpenWeatherMap',
      opacity: 0.75,
      maxZoom: 19,
      minZoom: 2,
      tileSize: 256,
      zoomOffset: 0,
      crossOrigin: true,
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      // Custom function to add timestamp for cache-busting
      getTileUrl: function(coords) {
        const timestamp = Math.floor(Date.now() / 3000); // Update every 3 seconds for smoother animation
        return `https://tile.openweathermap.org/map/${layerType}/${coords.z}/${coords.x}/${coords.y}.png?appid=${apiKey}&t=${timestamp}`;
      }
    });
  };
  
  // Rain radar layer (precipitation)
  rainLayer = createAnimatedLayer('precipitation_new');
  
  // Cloud layer
  cloudLayer = createAnimatedLayer('clouds_new');
  
  // Temperature heat map layer
  tempLayer = createAnimatedLayer('temp_new');
}

function switchRadarLayer(layerType) {
  if (!map) return;

  // Stop any existing animation
  stopRadarAnimation();

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
    
    // Start animation for the layer
    startRadarAnimation();
  }
}

function startRadarAnimation() {
  // Stop any existing animation
  stopRadarAnimation();
  
  if (!currentLayer || !map) return;
  
  // Show animation indicator
  if (radarAnimationIndicator) {
    radarAnimationIndicator.classList.remove("hidden");
  }
  
  // Animate by refreshing tiles periodically
  // Remove and re-add layer with updated cache-busting parameter
  radarAnimationInterval = setInterval(() => {
    if (currentLayer && map && map.hasLayer(currentLayer)) {
      // Get current layer type
      let layerType = '';
      if (currentLayer === rainLayer) layerType = 'precipitation_new';
      else if (currentLayer === cloudLayer) layerType = 'clouds_new';
      else if (currentLayer === tempLayer) layerType = 'temp_new';
      
      if (layerType) {
        const apiKey = "affdbceb55196fa0154c369ff0593d00";
        const timestamp = Date.now(); // Use milliseconds for better cache-busting
        
        // Remove current layer
        map.removeLayer(currentLayer);
        
        // Create new layer with updated timestamp
        const newLayer = L.tileLayer(`https://tile.openweathermap.org/map/${layerType}/{z}/{x}/{y}.png?appid=${apiKey}&t=${timestamp}`, {
          attribution: '© OpenWeatherMap',
          opacity: 0.75,
          maxZoom: 19,
          minZoom: 2,
          tileSize: 256,
          zoomOffset: 0,
          crossOrigin: true,
          errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        });
        
        // Update layer reference
        if (layerType === 'precipitation_new') rainLayer = newLayer;
        else if (layerType === 'clouds_new') cloudLayer = newLayer;
        else if (layerType === 'temp_new') tempLayer = newLayer;
        
        currentLayer = newLayer;
        currentLayer.addTo(map);
      }
    }
  }, 3000); // Update every 3 seconds for smooth animation
}

function stopRadarAnimation() {
  if (radarAnimationInterval) {
    clearInterval(radarAnimationInterval);
    radarAnimationInterval = null;
  }
  
  // Hide animation indicator
  if (radarAnimationIndicator) {
    radarAnimationIndicator.classList.add("hidden");
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
  
  // Stop animation
  stopRadarAnimation();
  
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

// ==========================
// EVENT PLANNER FUNCTIONS
// ==========================

// DOM Elements
const eventPlannerSection = document.getElementById("eventPlannerSection");
const toggleEventFormBtn = document.getElementById("toggleEventFormBtn");
const eventForm = document.getElementById("eventForm");
const eventTitle = document.getElementById("eventTitle");
const eventDate = document.getElementById("eventDate");
const eventTime = document.getElementById("eventTime");
const eventLocation = document.getElementById("eventLocation");
const saveEventBtn = document.getElementById("saveEventBtn");
const cancelEventBtn = document.getElementById("cancelEventBtn");
const editingEventId = document.getElementById("editingEventId");
const listViewBtn = document.getElementById("listViewBtn");
const calendarViewBtn = document.getElementById("calendarViewBtn");
const eventListView = document.getElementById("eventListView");
const eventCalendarView = document.getElementById("eventCalendarView");
const eventListContainer = document.getElementById("eventListContainer");
const calendarContainer = document.getElementById("calendarContainer");
const calendarMonthYear = document.getElementById("calendarMonthYear");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let reminderIntervals = {};

// Initialize event planner
function initEventPlanner() {
  // Set minimum date to today
  const today = new Date().toISOString().split('T')[0];
  eventDate.setAttribute('min', today);
  
  // Load and render events
  renderEvents();
  renderCalendar();
  
  // Fetch weather for all existing events
  const events = getEvents();
  events.forEach(event => {
    const eventDateTime = new Date(`${event.date}T${event.time}`);
    const now = new Date();
    // Only fetch weather for future events
    if (eventDateTime > now) {
      fetchEventWeather(event);
      setupReminder(event);
    }
  });
  
  // Event listeners
  toggleEventFormBtn.addEventListener("click", () => {
    eventForm.classList.toggle("hidden");
    if (!eventForm.classList.contains("hidden")) {
      eventTitle.focus();
    }
  });
  
  saveEventBtn.addEventListener("click", saveEvent);
  cancelEventBtn.addEventListener("click", () => {
    eventForm.classList.add("hidden");
    resetEventForm();
  });
  
  listViewBtn.addEventListener("click", () => {
    listViewBtn.classList.add("active");
    calendarViewBtn.classList.remove("active");
    eventListView.classList.remove("hidden");
    eventCalendarView.classList.add("hidden");
  });
  
  calendarViewBtn.addEventListener("click", () => {
    calendarViewBtn.classList.add("active");
    listViewBtn.classList.remove("active");
    eventCalendarView.classList.remove("hidden");
    eventListView.classList.add("hidden");
    renderCalendar();
  });
  
  prevMonthBtn.addEventListener("click", () => {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) {
      currentCalendarMonth = 11;
      currentCalendarYear--;
    }
    renderCalendar();
  });
  
  nextMonthBtn.addEventListener("click", () => {
    currentCalendarMonth++;
    if (currentCalendarMonth > 11) {
      currentCalendarMonth = 0;
      currentCalendarYear++;
    }
    renderCalendar();
  });
  
  // Check reminders every minute
  setInterval(checkReminders, 60000);
  checkReminders();
}

// Event Storage Functions
function getEvents() {
  const events = JSON.parse(localStorage.getItem("skycast_events")) || [];
  return events.sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA - dateB;
  });
}

function saveEvents(events) {
  localStorage.setItem("skycast_events", JSON.stringify(events));
}

function saveEvent() {
  const title = eventTitle.value.trim();
  const date = eventDate.value;
  const time = eventTime.value;
  const location = eventLocation.value.trim();
  const eventId = editingEventId.value || Date.now().toString();
  
  if (!title || !date || !time || !location) {
    showError("Please fill in all fields");
    return;
  }
  
  const events = getEvents();
  const eventDateTime = new Date(`${date}T${time}`);
  
  if (eventDateTime < new Date()) {
    showError("Event date/time must be in the future");
    return;
  }
  
  const eventData = {
    id: eventId,
    title,
    date,
    time,
    location,
    createdAt: editingEventId.value ? events.find(e => e.id === eventId)?.createdAt || Date.now() : Date.now()
  };
  
  if (editingEventId.value) {
    const index = events.findIndex(e => e.id === eventId);
    if (index !== -1) {
      events[index] = eventData;
    }
  } else {
    events.push(eventData);
  }
  
  saveEvents(events);
  eventForm.classList.add("hidden");
  resetEventForm();
  renderEvents();
  renderCalendar();
  
  // Fetch weather for the event
  fetchEventWeather(eventData);
  
  // Setup reminder
  setupReminder(eventData);
}

function deleteEvent(eventId) {
  if (confirm("Are you sure you want to delete this event?")) {
    const events = getEvents().filter(e => e.id !== eventId);
    saveEvents(events);
    
    // Clear reminder
    if (reminderIntervals[eventId]) {
      clearInterval(reminderIntervals[eventId]);
      delete reminderIntervals[eventId];
    }
    
    // Clear reminder shown flag
    localStorage.removeItem(`reminder_shown_${eventId}`);
    
    // Clear weather cache for this event
    const weatherCache = JSON.parse(localStorage.getItem("skycast_event_weather") || "{}");
    delete weatherCache[eventId];
    localStorage.setItem("skycast_event_weather", JSON.stringify(weatherCache));
    
    renderEvents();
    renderCalendar();
  }
}

function editEvent(eventId) {
  const events = getEvents();
  const event = events.find(e => e.id === eventId);
  
  if (event) {
    eventTitle.value = event.title;
    eventDate.value = event.date;
    eventTime.value = event.time;
    eventLocation.value = event.location;
    editingEventId.value = event.id;
    eventForm.classList.remove("hidden");
    eventTitle.focus();
  }
}

function resetEventForm() {
  eventTitle.value = "";
  eventDate.value = "";
  eventTime.value = "";
  eventLocation.value = "";
  editingEventId.value = "";
}

// Render Functions
function renderEvents() {
  const events = getEvents();
  eventListContainer.innerHTML = "";
  
  if (events.length === 0) {
    eventListContainer.innerHTML = '<p class="no-events">No events scheduled. Create one to get started!</p>';
    return;
  }
  
  events.forEach(event => {
    const eventCard = createEventCard(event);
    eventListContainer.appendChild(eventCard);
  });
}

function createEventCard(event) {
  const eventCard = document.createElement("div");
  eventCard.className = "event-card";
  
  const eventDateTime = new Date(`${event.date}T${event.time}`);
  const now = new Date();
  const isPast = eventDateTime < now;
  
  if (isPast) {
    eventCard.classList.add("event-past");
  }
  
  // Get weather info if available
  const weatherInfo = getEventWeatherInfo(event.id);
  
  eventCard.innerHTML = `
    <div class="event-card-header">
      <h4 class="event-title">${event.title}</h4>
      <div class="event-actions">
        <button class="event-edit-btn" data-event-id="${event.id}">✏️</button>
        <button class="event-delete-btn" data-event-id="${event.id}">🗑️</button>
      </div>
    </div>
    <div class="event-card-body">
      <div class="event-details">
        <div class="event-detail-item">
          <span class="event-icon">📅</span>
          <span>${formatEventDate(event.date)}</span>
        </div>
        <div class="event-detail-item">
          <span class="event-icon">🕐</span>
          <span>${formatEventTime(event.time)}</span>
        </div>
        <div class="event-detail-item">
          <span class="event-icon">📍</span>
          <span>${event.location}</span>
        </div>
      </div>
      ${weatherInfo ? `
        <div class="event-weather-info ${weatherInfo.alert ? 'weather-alert' : ''}">
          <div class="event-weather-main">
            <img src="${weatherInfo.icon}" alt="${weatherInfo.description}" class="event-weather-icon">
            <div class="event-weather-details">
              <span class="event-weather-temp">${weatherInfo.temp}°${currentUnit === "metric" ? "C" : "F"}</span>
              <span class="event-weather-desc">${weatherInfo.description}</span>
            </div>
          </div>
          ${weatherInfo.alert ? `<div class="weather-alert-badge">⚠️ ${weatherInfo.alert}</div>` : ''}
          ${weatherInfo.suggestion ? `<div class="weather-suggestion">💡 ${weatherInfo.suggestion}</div>` : ''}
          <button class="suggest-time-btn" data-event-id="${event.id}">🔍 Find Better Time</button>
        </div>
      ` : '<div class="event-weather-loading">Loading weather...</div>'}
    </div>
  `;
  
  // Attach event listeners
  const editBtn = eventCard.querySelector('.event-edit-btn');
  const deleteBtn = eventCard.querySelector('.event-delete-btn');
  const suggestBtn = eventCard.querySelector('.suggest-time-btn');
  
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editEvent(event.id);
    });
  }
  
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEvent(event.id);
    });
  }
  
  if (suggestBtn) {
    suggestBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showBetterTimeSuggestions(event.id);
    });
  }
  
  return eventCard;
}

function renderCalendar() {
  const events = getEvents();
  const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1);
  const lastDay = new Date(currentCalendarYear, currentCalendarMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  
  calendarMonthYear.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;
  
  calendarContainer.innerHTML = "";
  
  // Day headers
  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dayHeaders.forEach(day => {
    const dayHeader = document.createElement("div");
    dayHeader.className = "calendar-day-header";
    dayHeader.textContent = day;
    calendarContainer.appendChild(dayHeader);
  });
  
  // Empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    calendarContainer.appendChild(emptyCell);
  }
  
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";
    
    const dateStr = `${currentCalendarYear}-${String(currentCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = events.filter(e => e.date === dateStr);
    
    const today = new Date();
    if (currentCalendarYear === today.getFullYear() && 
        currentCalendarMonth === today.getMonth() && 
        day === today.getDate()) {
      dayCell.classList.add("calendar-day-today");
    }
    
    dayCell.innerHTML = `
      <div class="calendar-day-number">${day}</div>
      <div class="calendar-day-events">
        ${dayEvents.slice(0, 3).map(event => `
          <div class="calendar-event-dot" title="${event.title}"></div>
        `).join('')}
        ${dayEvents.length > 3 ? `<div class="calendar-event-more">+${dayEvents.length - 3}</div>` : ''}
      </div>
    `;
    
    if (dayEvents.length > 0) {
      dayCell.classList.add("calendar-day-has-events");
      dayCell.addEventListener("click", () => {
        showDayEvents(dateStr, dayEvents);
      });
    }
    
    calendarContainer.appendChild(dayCell);
  }
}

function showDayEvents(dateStr, events) {
  const modal = document.createElement("div");
  modal.className = "event-modal";
  modal.innerHTML = `
    <div class="event-modal-content">
      <div class="event-modal-header">
        <h3>Events on ${formatEventDate(dateStr)}</h3>
        <button class="event-modal-close">✕</button>
      </div>
      <div class="event-modal-body">
      </div>
    </div>
  `;
  
  const modalBody = modal.querySelector('.event-modal-body');
  events.forEach(event => {
    const eventCard = createEventCard(event);
    modalBody.appendChild(eventCard);
  });
  
  // Add close button listener
  const closeBtn = modal.querySelector('.event-modal-close');
  closeBtn.addEventListener('click', () => {
    modal.remove();
  });
  
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Weather Integration
async function fetchEventWeather(event) {
  try {
    const eventDateTime = new Date(`${event.date}T${event.time}`);
    const now = new Date();
    
    // Only fetch weather for future events
    if (eventDateTime < now) {
      return;
    }
    
    // Get forecast for the event location
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(event.location)}&units=${currentUnit}&appid=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error("Weather data unavailable");
    }
    
    const data = await response.json();
    
    // Find the forecast closest to event time
    const eventTimestamp = eventDateTime.getTime() / 1000;
    let closestForecast = data.list[0];
    let minDiff = Math.abs(closestForecast.dt - eventTimestamp);
    
    data.list.forEach(forecast => {
      const diff = Math.abs(forecast.dt - eventTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestForecast = forecast;
      }
    });
    
    // Analyze weather and create alerts/suggestions
    const weatherInfo = analyzeEventWeather(closestForecast, eventDateTime);
    
    // Store weather info
    const weatherCache = JSON.parse(localStorage.getItem("skycast_event_weather") || "{}");
    weatherCache[event.id] = {
      ...weatherInfo,
      timestamp: Date.now()
    };
    localStorage.setItem("skycast_event_weather", JSON.stringify(weatherCache));
    
    // Re-render events to show weather
    renderEvents();
    
  } catch (error) {
    console.error("Error fetching event weather:", error);
  }
}

function analyzeEventWeather(forecast, eventDateTime) {
  const temp = Math.round(forecast.main.temp);
  const description = forecast.weather[0].description;
  const icon = `https://openweathermap.org/img/wn/${forecast.weather[0].icon}@2x.png`;
  const weatherMain = forecast.weather[0].main.toLowerCase();
  const pop = forecast.pop || 0;
  const feelsLike = Math.round(forecast.main.feels_like);
  const windSpeed = forecast.wind.speed;
  
  let alert = null;
  let suggestion = null;
  
  // Check for rain/storms
  if (weatherMain.includes("rain") || weatherMain.includes("drizzle") || pop > 0.5) {
    alert = "Rain expected";
    suggestion = "Consider bringing an umbrella or rescheduling if outdoor event";
  }
  
  // Check for storms
  if (weatherMain.includes("thunderstorm")) {
    alert = "Thunderstorm warning";
    suggestion = "Consider rescheduling - severe weather expected";
  }
  
  // Check for extreme heat
  const tempUnit = currentUnit === "metric" ? "C" : "F";
  const heatThreshold = currentUnit === "metric" ? 35 : 95;
  if (feelsLike > heatThreshold) {
    alert = "Extreme heat";
    suggestion = "Stay hydrated and consider indoor venue or later time";
  }
  
  // Check for extreme cold
  const coldThreshold = currentUnit === "metric" ? 0 : 32;
  if (feelsLike < coldThreshold) {
    alert = "Very cold";
    suggestion = "Dress warmly or consider indoor venue";
  }
  
  // Check for high wind
  const windThreshold = currentUnit === "metric" ? 10 : 22; // m/s to km/h or mph
  if (windSpeed > windThreshold) {
    if (!alert) {
      alert = "High winds";
      suggestion = "Be cautious of windy conditions";
    }
  }
  
  // Suggest better times if weather is poor
  if (alert && !suggestion.includes("rescheduling")) {
    suggestion += " - Check forecast for better times";
  }
  
  return {
    temp,
    description: description.charAt(0).toUpperCase() + description.slice(1),
    icon,
    alert,
    suggestion
  };
}

function getEventWeatherInfo(eventId) {
  const weatherCache = JSON.parse(localStorage.getItem("skycast_event_weather") || "{}");
  const weather = weatherCache[eventId];
  
  // Return weather if it's less than 1 hour old
  if (weather && Date.now() - weather.timestamp < 3600000) {
    return weather;
  }
  
  return null;
}

// Suggestion System
async function suggestBetterTime(event) {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(event.location)}&units=${currentUnit}&appid=${apiKey}`
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const eventDateTime = new Date(`${event.date}T${event.time}`);
    const eventHour = eventDateTime.getHours();
    
    // Look for better weather in the same day (within 6 hours)
    const sameDayForecasts = data.list.filter(f => {
      const forecastDate = new Date(f.dt * 1000);
      return forecastDate.toDateString() === eventDateTime.toDateString() &&
             Math.abs(forecastDate.getHours() - eventHour) <= 6;
    });
    
    if (sameDayForecasts.length === 0) {
      return null;
    }
    
    // Find forecast with best weather (no rain, moderate temp)
    const bestForecast = sameDayForecasts.reduce((best, current) => {
      const currentMain = current.weather[0].main.toLowerCase();
      const bestMain = best.weather[0].main.toLowerCase();
      
      // Prefer clear weather
      if (currentMain.includes("clear") && !bestMain.includes("clear")) {
        return current;
      }
      
      // Avoid rain/storms
      if (bestMain.includes("rain") || bestMain.includes("thunderstorm")) {
        if (!currentMain.includes("rain") && !currentMain.includes("thunderstorm")) {
          return current;
        }
      }
      
      // Prefer moderate temperatures
      const currentFeelsLike = current.main.feels_like;
      const bestFeelsLike = best.main.feels_like;
      const idealTemp = currentUnit === "metric" ? 22 : 72;
      
      const currentDiff = Math.abs(currentFeelsLike - idealTemp);
      const bestDiff = Math.abs(bestFeelsLike - idealTemp);
      
      if (currentDiff < bestDiff) {
        return current;
      }
      
      return best;
    });
    
    if (bestForecast) {
      const suggestedTime = new Date(bestForecast.dt * 1000);
      const suggestedHour = suggestedTime.getHours();
      const suggestedMinute = suggestedTime.getMinutes();
      
      if (suggestedHour !== eventHour || suggestedMinute !== eventDateTime.getMinutes()) {
        return {
          time: `${String(suggestedHour).padStart(2, '0')}:${String(suggestedMinute).padStart(2, '0')}`,
          weather: analyzeEventWeather(bestForecast, suggestedTime)
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error suggesting better time:", error);
    return null;
  }
}

// Reminder System
function setupReminder(event) {
  // Clear existing reminder
  if (reminderIntervals[event.id]) {
    clearInterval(reminderIntervals[event.id]);
  }
  
  const eventDateTime = new Date(`${event.date}T${event.time}`);
  const now = new Date();
  const timeUntilEvent = eventDateTime - now;
  
  // Set reminder 1 hour before event
  const reminderTime = timeUntilEvent - (60 * 60 * 1000);
  
  if (reminderTime > 0) {
    reminderIntervals[event.id] = setTimeout(() => {
      showReminder(event);
    }, reminderTime);
  }
}

function checkReminders() {
  const events = getEvents();
  const now = new Date();
  
  events.forEach(event => {
    const eventDateTime = new Date(`${event.date}T${event.time}`);
    const timeUntilEvent = eventDateTime - now;
    const oneHour = 60 * 60 * 1000;
    
    // Show reminder if event is within 1 hour and hasn't been shown
    if (timeUntilEvent > 0 && timeUntilEvent <= oneHour) {
      const reminderShown = localStorage.getItem(`reminder_shown_${event.id}`);
      if (!reminderShown) {
        showReminder(event);
        localStorage.setItem(`reminder_shown_${event.id}`, "true");
      }
    }
  });
}

function showReminder(event) {
  const weatherInfo = getEventWeatherInfo(event.id);
  let message = `⏰ Reminder: ${event.title} is in 1 hour!\n`;
  message += `📍 Location: ${event.location}\n`;
  message += `🕐 Time: ${formatEventTime(event.time)}`;
  
  if (weatherInfo) {
    message += `\n🌤️ Weather: ${weatherInfo.description}, ${weatherInfo.temp}°${currentUnit === "metric" ? "C" : "F"}`;
    if (weatherInfo.alert) {
      message += `\n⚠️ Alert: ${weatherInfo.alert}`;
    }
  }
  
  if (confirm(message + "\n\nWould you like to view this event?")) {
    editEvent(event.id);
  }
}

// Utility Functions
function formatEventDate(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function formatEventTime(timeStr) {
  const [hours, minutes] = timeStr.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

// Initialize event planner on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEventPlanner);
} else {
  initEventPlanner();
}

// Show better time suggestions
async function showBetterTimeSuggestions(eventId) {
  const events = getEvents();
  const event = events.find(e => e.id === eventId);
  
  if (!event) {
    alert("Event not found!");
    return;
  }
  
  // Show loading message
  const loadingMsg = "Searching for better times based on weather forecast...";
  alert(loadingMsg);
  
  try {
    const suggestion = await suggestBetterTime(event);
    
    if (suggestion && suggestion.time !== event.time) {
      const message = `Found a better time for "${event.title}":\n\n` +
        `Current: ${formatEventTime(event.time)}\n` +
        `Suggested: ${formatEventTime(suggestion.time)}\n\n` +
        `Weather: ${suggestion.weather.description}, ${suggestion.weather.temp}°${currentUnit === "metric" ? "C" : "F"}\n\n` +
        `Would you like to update the event time?`;
      
      if (confirm(message)) {
        event.time = suggestion.time;
        const allEvents = getEvents();
        const index = allEvents.findIndex(e => e.id === eventId);
        if (index !== -1) {
          allEvents[index] = event;
          saveEvents(allEvents);
          fetchEventWeather(event);
          setupReminder(event);
          renderEvents();
          renderCalendar();
          alert("Event time updated successfully!");
        }
      }
    } else {
      alert("No better time found for this event. The current time seems optimal based on the weather forecast!");
    }
  } catch (error) {
    console.error("Error finding better time:", error);
    alert("Unable to find better time suggestions. Please try again later.");
  }
}

// Make functions available globally for onclick handlers
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.showBetterTimeSuggestions = showBetterTimeSuggestions;