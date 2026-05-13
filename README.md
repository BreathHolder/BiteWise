# BiteWise

Smart food and water tracking. Your data stays on your device.

## What It Does

BiteWise is a progressive web app (PWA) for tracking daily meals and water intake.
Food nutrition data is pulled from the USDA FoodData Central database.
All data is stored locally using IndexedDB. Backups go directly to your personal
OneDrive or Google Drive — no BiteWise server ever touches your data.

## Features

- **Food logging** — Search the USDA FoodData Central database or create custom foods
- **Meal slots** — Breakfast, Lunch, Dinner, and Snacks with snack motivation tracking
- **Water tracking** — Fluid ounces or milliliters, user-selectable
- **Nutrition** — Calories (required), plus optional protein, carbs, fat, fiber, sugar, sodium, saturated fat
- **Daily targets** — All optional; baseline-first approach encouraged
- **Dashboard** — Daily, weekly (7-day), and monthly (30-day) trend views
- **Cloud backup** — OneDrive or Google Drive via OAuth PKCE (tokens stored locally only)
- **PWA** — Installable, offline-capable via service worker

---

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/BreathHolder/BiteWise.git
cd BiteWise
```

### 2. Register OAuth apps (required for cloud backup)

Cloud backup is optional. The app works fully without it. When you're ready:

#### Microsoft OneDrive

1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → New registration
2. Name: `BiteWise`
3. Supported account types: **Personal Microsoft accounts only**
4. Redirect URI: `https://breathholder.github.io/BiteWise/` (type: Single-page application)
5. After registering, copy the **Application (client) ID**
6. Under Authentication, ensure the redirect URI is listed under Single-page application

#### Google Drive

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorized redirect URIs: `https://breathholder.github.io/BiteWise/`
4. Enable the **Google Drive API** under APIs & Services → Library
5. Copy the **Client ID**

> **Note on Google's token endpoint:** Google's `/token` endpoint may reject
> browser-direct CORS requests for the `authorization_code` grant. If you encounter
> this, a lightweight Cloudflare Worker proxy (free tier) can relay the token exchange.
> See `docs/js/auth.js` for details.

### 3. Add client IDs to the app

Open `docs/js/auth.js` and replace the placeholder values:

```javascript
const MICROSOFT_CONFIG = {
  client_id: 'YOUR_MICROSOFT_CLIENT_ID',  // Replace this
  ...
};

const GOOGLE_CONFIG = {
  client_id: 'YOUR_GOOGLE_CLIENT_ID',  // Replace this
  ...
};
```

### 4. USDA API key (optional but recommended for production)

The app uses `DEMO_KEY` by default (1,000 requests/hour, 10,000/day — fine for personal use).
For higher limits, register a free key at [api.data.gov/signup](https://api.data.gov/signup/)
and replace `DEMO_KEY` in `docs/js/food.js`.

### 5. Deploy to GitHub Pages

The repo is configured to serve from the `/docs` folder on the `main` branch.
Push your changes:

```bash
git add .
git commit -m "Configure OAuth and deploy BiteWise"
git push origin main
```

GitHub Pages will publish to `https://breathholder.github.io/BiteWise/`.

---

## File Structure

```
docs/
├── index.html          # App shell
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── css/
│   └── app.css         # All styles
└── js/
    ├── app.js          # Router + bootstrap
    ├── db.js           # IndexedDB wrapper
    ├── auth.js         # OAuth (OneDrive + Google Drive)
    ├── sync.js         # Cloud sync
    ├── onboarding.js   # First-run flow
    ├── food.js         # USDA API + food utilities
    ├── log.js          # Meal/water logging screen
    ├── dashboard.js    # Trends and analytics screen
    └── settings.js     # Settings screen
```

---

## Data Storage

All data is stored in an IndexedDB database named `bitewise` with these object stores:

| Store        | Contents                              |
|--------------|---------------------------------------|
| `profile`    | Name, birthday, email, preferences   |
| `food_log`   | Meal entries with nutrition           |
| `water_log`  | Water intake entries                  |
| `foods`      | Cached USDA foods + custom foods      |
| `recipes`    | User-defined dishes                   |
| `targets`    | Daily nutrition/water goals           |
| `sync_meta`  | OAuth tokens, last sync timestamp     |

OAuth tokens are stored in `sync_meta` only. No user data is stored in GitHub.

---

## License

GPL-3.0 — see LICENSE file.
