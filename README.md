# Plex Clean & Curate 🎬✨

A clean, opinionated web dashboard and automation service for Plex Media Server. Designed to replace complex rule engines like Maintainerr with a simple, visual experience for managing unwatched media, automated cleanup collections, and curated TV home shelves.

---

## 🌟 Key Features

### 1. 🧹 Automated Library Cleanup ("Leaving Soon")
- **Dynamic Unwatched Filter:** Instant slider/quick-selector (1, 2, 3, 6, 9, 12 months) right on the dashboard to preview disk space and media candidates.
- **Seerr Requester Filter:** One-click toggle to filter only media that was **requested by someone else in Overseerr / Jellyseerr**.
- **Automated Plex Collection:** Creates and synchronizes a collection (e.g. *"Leaving at the end of the month"*).
- **Auto-Save on Watch:** If any user plays an item staged in the leaving collection, it is automatically removed and reset!
- **Safe Arr Deletion:** Removes files and unmonitors them via **Radarr** and **Sonarr** so they aren't re-downloaded.
- **Dry-Run Mode (Simulation):** Enabled by default so you can inspect everything safely without deleting any files.

### 2. ⭐ Curated TV Home Screen Shelves ("Admin Recommendations")
- **One-Click Feature:** Click the **⭐ Recommend** button on any movie or TV show to instantly publish it to your Plex TV Home screen!
- **Most Recently Favorited First:** The shelf is automatically sorted so your newest recommendations appear first on the TV.
- **Dedicated Shelf:** Maintains *"Recommended Movies"* and *"Recommended Shows"* collections promoted to Home and Library Recommended tabs.

### 3. 🛡️ Whitelist / "Keep" Protection
- Protect classics, family favorites, or personal archives with one click. Kept items are permanently exempt from cleanup.

### 4. 🔒 External Access & Plex OAuth Login
- **Sign in with Plex:** Built-in Plex PIN OAuth flow.
- **Admin-Only Lockdown:** When exposing the dashboard externally (via Cloudflare Tunnels, Nginx Proxy Manager, Caddy, or Traefik), it verifies that only the **Plex Server Owner / Admin** account can access and manage the system. Other users are rejected.
- **Persistent Sessions:** Uses secure HttpOnly cookies across browser sessions.

### 5. 🔔 Discord Webhook Alerts
- **Monthly Announcement:** Rich embed sent to your Discord channel when items are staged into the leaving collection.
- **48-Hour Countdown Warning:** Pre-deletion reminder of items and space to be reclaimed.
- **Cleanup Report:** Summary of freed storage space.

---

## 📺 How to Arrange Rows on Your Plex TV Home Screen

Plex allows server administrators to publish collections directly onto the Home screen for the server owner and shared users.

1. This application automatically sets the required Plex promotion flags:
   - `promotedToOwnHome = 1`
   - `promotedToSharedHome = 1`
   - `promotedToRecommended = 1`
2. **To customize the shelf order on your TV app:**
   - Open **Plex Web**.
   - Navigate to **Settings > Manage > Libraries > Manage Recommendations**.
   - Under your Movies or TV Shows library, drag your shelves into your preferred order:
     ```text
     1. Continue Watching
     2. Recently Added Shows
     3. Recently Added Films
     4. Recommended Movies (⭐ Your Curated Picks)
     5. Leaving at the end of the month (⚠️ Cleanup Shelf)
     ```
   - All TV apps (Apple TV, Android TV, Fire TV, Roku) will render the rows in this order.

---

## 🚀 Quick Start with Docker Compose

### 1. Clone & Configure
```bash
git clone https://github.com/your-username/PlexLibraryCleanup.git
cd PlexLibraryCleanup
cp .env.example .env
```

### 2. Edit `.env`
Fill in your connection details in `.env`:
```ini
PLEX_URL=http://192.168.1.100:32400
PLEX_TOKEN=your_plex_token_here
PLEX_MOVIE_LIBRARIES=Movies
PLEX_TV_LIBRARIES=TV Shows

OVERSEERR_URL=http://192.168.1.100:5055
OVERSEERR_API_KEY=your_overseerr_key

RADARR_URL=http://192.168.1.100:7878
RADARR_API_KEY=your_radarr_key

SONARR_URL=http://192.168.1.100:8989
SONARR_API_KEY=your_sonarr_key

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DRY_RUN=true
```

> **Finding your Plex Token:** [Official Plex Guide](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/)

### 3. Launch Container
```bash
docker-compose up -d
```
Open **`http://<your-server-ip>:6064`** in your browser.

---

## 💻 Local Development Setup

### Backend (Python 3.11+)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.main
```

### Frontend (React + Vite + Tailwind)
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:3000`.

---

## ⚙️ Configuration Reference

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `6064` | Web dashboard listening port |
| `PLEX_AUTH_ENABLED` | `true` | Restrict dashboard access exclusively to Plex Server Admin |
| `DRY_RUN` | `true` | When `true`, no files are deleted (simulation mode) |
| `PLEX_URL` | `http://localhost:32400` | URL of your Plex Media Server |
| `PLEX_TOKEN` | - | Plex authentication token (X-Plex-Token) |
| `PLEX_MOVIE_LIBRARIES` | `Movies` | Comma-separated list of movie library names |
| `PLEX_TV_LIBRARIES` | `TV Shows` | Comma-separated list of TV show library names |
| `OVERSEERR_URL` | - | Overseerr / Jellyseerr URL |
| `OVERSEERR_API_KEY` | - | Overseerr API key |
| `RADARR_URL` | - | Radarr server URL |
| `RADARR_API_KEY` | - | Radarr API key |
| `SONARR_URL` | - | Sonarr server URL |
| `SONARR_API_KEY` | - | Sonarr API key |
| `DISCORD_WEBHOOK_URL` | - | Discord webhook URL for notifications |
| `MOVIES_CLEANUP_ENABLED` | `true` | Enable/disable cleanup collection for Movies |
| `TV_CLEANUP_ENABLED` | `false` | Enable/disable cleanup collection for TV Shows |
| `DEFAULT_UNWATCHED_MONTHS_MOVIES` | `6` | Default cutoff in months for Movies |
| `DEFAULT_UNWATCHED_MONTHS_SHOWS` | `6` | Default cutoff in months for TV Shows |
| `LEAVING_COLLECTION_NAME` | `Leaving at the end of the month` | Name of the leaving soon collection on Plex |
| `RECOMMENDED_MOVIES_COLLECTION` | `Recommended Movies` | Name of the curated movie shelf on Plex |
| `RECOMMENDED_SHOWS_COLLECTION` | `Recommended Shows` | Name of the curated TV shelf on Plex |
| `CRON_SCHEDULE` | `0 3 * * *` | Automated scan frequency (default: 3:00 AM daily) |

---

## 📄 License
MIT License
