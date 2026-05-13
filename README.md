# BiteWise

Smart food and water tracking. Your data stays on your device.

## What It Does

BiteWise is a progressive web app (PWA) for tracking daily meals and water intake.
Food nutrition data is pulled from the USDA FoodData Central database.
All data is stored locally using IndexedDB. Backups go directly to your personal
browser profile. Cloud backup is temporarily disabled until the OAuth flow is fixed.

## Features

- **Food logging** — Search the USDA FoodData Central database or create custom foods
- **Meal slots** — Breakfast, Lunch, Dinner, and Snacks with snack motivation tracking
- **Water tracking** — Fluid ounces or milliliters, user-selectable
- **Nutrition** — Calories (required), plus optional protein, carbs, fat, fiber, sugar, sodium, saturated fat
- **Daily targets** — All optional; baseline-first approach encouraged
- **Dashboard** — Daily, weekly (7-day), and monthly (30-day) trend views
- **Local-only storage** — Profile, logs, foods, recipes, and targets stay in IndexedDB
- **PWA** — Installable, offline-capable via service worker

---

## Setup

### 1. Clone and configure

```bash
git clone https://github.com/BreathHolder/BiteWise.git
cd BiteWise
```

### 2. USDA API key (optional but recommended for production)

The app uses `DEMO_KEY` by default (1,000 requests/hour, 10,000/day — fine for personal use).
For higher limits, register a free key at [api.data.gov/signup](https://api.data.gov/signup/)
and replace `DEMO_KEY` in `docs/js/food.js`.

### 3. Deploy to GitHub Pages

The repo is configured to serve from the `/docs` folder on the `main` branch.
Push your changes:

```bash
git add .
git commit -m "Deploy BiteWise"
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
    ├── auth.js         # Disabled OAuth implementation kept for later
    ├── sync.js         # Disabled cloud sync implementation kept for later
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
| `sync_meta`  | Reserved for future sync metadata     |

No user data is stored in GitHub or sent to any BiteWise server.

---

## License

GPL-3.0 — see LICENSE file.
