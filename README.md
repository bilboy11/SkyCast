# SkyCast - Progressive Web App

A beautiful, feature-rich Progressive Web App for weather information with offline support.

## Features

- 🌤️ Real-time weather data
- 📅 5-day weather forecast
- 🌅 Sunrise and sunset times
- ⏰ Live clock with timezone support
- 📱 Fully responsive and mobile-optimized
- 🔄 Offline support via Service Worker
- 📲 Installable as a PWA
- 💾 Local storage for search history

## PWA Setup

### Generating Icons

The app requires PNG icons in multiple sizes. You have two options:

#### Option 1: Using Node.js (Recommended)

1. Install dependencies:
```bash
npm install
```

2. Generate icons:
```bash
npm run generate-icons
```

This will create all required icon files (72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512).

#### Option 2: Using Browser

1. Open `generate-icons.html` in your browser
2. Click "Generate Icons" button
3. Icons will be downloaded automatically

#### Option 3: Manual Creation

Create PNG icons manually using the `icon.svg` file as a reference. Required sizes:
- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512

## Installation

### As a PWA

1. Open the app in a supported browser (Chrome, Edge, Safari, Firefox)
2. Look for the install prompt or use the browser's menu
3. Click "Install" or "Add to Home Screen"
4. The app will be installed and can be launched like a native app

### Local Development

1. Serve the files using a local web server (required for Service Worker)
2. For example, using Python:
```bash
python -m http.server 8000
```
3. Or using Node.js http-server:
```bash
npx http-server -p 8000
```
4. Open `http://localhost:8000` in your browser

## Service Worker

The app includes a Service Worker that:
- Caches app files for offline access
- Provides offline functionality
- Automatically updates when new versions are available
- Skips caching API requests (always fetches fresh weather data)

## Browser Support

- ✅ Chrome/Edge (Android & Desktop)
- ✅ Safari (iOS & macOS)
- ✅ Firefox
- ✅ Samsung Internet

## API Key

The app uses OpenWeatherMap API. Make sure to:
1. Get your free API key from [OpenWeatherMap](https://openweathermap.org/api)
2. Replace the API key in `script.js` if needed

## Offline Functionality

- App shell is cached for offline access
- UI remains functional offline
- Weather data requires internet connection
- Search history is stored locally

## License

MIT
