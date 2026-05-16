# BiteWise

Smart food and water tracking. Your data stays on your device.

## What It Does

BiteWise is a progressive web app (PWA) for tracking daily meals, water intake,
and daily weigh-ins.
Food nutrition data is pulled from the USDA FoodData Central database.
All data is stored locally using IndexedDB. Optional cloud backups go directly to
your Google Drive or OneDrive app storage after you connect a provider.

## Features

- **Food logging** — Search USDA FoodData Central, saved/custom foods, or your own backend menu tables
- **Meal slots** — Breakfast, Lunch, Dinner, and Snacks with snack motivation tracking
- **Water tracking** — Fluid ounces or milliliters, user-selectable
- **Weight tracking** — One daily weigh-in with weekly and monthly trends
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
and enter it in Settings -> USDA API key, or copy `docs/js/config.example.js` to
`docs/js/config.js` and set `USDA_API_KEY`.

### 3. Cloud backup setup (optional)

To enable Settings -> Backup & restore, create one or both OAuth apps and paste
their client IDs into the Backup & restore screen. BiteWise saves those IDs
locally in IndexedDB along with the provider tokens.

You can also prefill client IDs by copying `docs/js/config.example.js` to
`docs/js/config.js` and setting:

```js
MICROSOFT_CLIENT_ID: '...',
GOOGLE_CLIENT_ID: '...'
```

For Microsoft, create an Azure app registration for personal Microsoft accounts
and add your deployed BiteWise URL as a single-page application redirect URI.
For Google, create an OAuth web client, enable the Google Drive API, and add the
same deployed BiteWise URL as an authorized redirect URI.

If Google shows "Access blocked" or says the app has not completed verification,
open Google Auth Platform for that project. For personal use, keep the publishing
status in Testing and add the exact Google account you are signing in with under
Test users. For broader use, publish the app and complete Google's OAuth
verification process before users outside the test list can connect.

Backups are stored as `bitewise-backup.json`. OneDrive stores it in the app root
folder, and Google Drive stores it in the hidden `appDataFolder`.

On a new browser or device with no local BiteWise profile, the welcome screen
lets you either create a new profile or connect Google Drive/OneDrive and restore
an existing backup before entering the app.

### 4. Bundled food tables

BiteWise can search static nutrition tables stored in `docs/data/`. Wendy's and
McDonald's core menus are included as bundled sources:

```text
docs/data/wendys_core_menu.csv
docs/data/mcdonalds_core_menu.csv
```

The CSV header format is:

```csv
Menu Item,Energy (kcal),Fat (g),Saturated Fat (g),Carbohydrates (g),Sugars (g),Fibre (g),Protein (g),Salt (g)
```

`Salt (g)` is converted to sodium in milligrams for BiteWise logging using the
standard nutrition-label conversion of salt grams x 400.

To add another bundled source:

1. Add a CSV file under `docs/data/`, for example `docs/data/mcdonalds_core_menu.csv`.
2. Use the same headers shown above.
3. Add one entry to `BUNDLED_FOOD_SOURCES` in `docs/js/food.js`:

```js
{
  id: 'mcdonalds_core_menu',
  label: "McDonald's",
  brand: "McDonald's",
  category: 'Core Menu',
  url: 'data/mcdonalds_core_menu.csv',
  format: 'csv'
}
```

4. Add the CSV path to `STATIC_ASSETS` in `docs/sw.js` if it should be available offline.

The Log food search defaults to USDA. Use the source selector in the Add Food
modal to search only Wendy's, only McDonald's, the configured backend endpoint,
or all sources together.

### 5. Backend food tables (optional)

In Settings -> Backend food tables, enter a search endpoint for your own restaurant
or home menu data. BiteWise calls it with `q`, `page`, and `pageSize` query params.

The endpoint can return an array directly, or an object with `foods`, `results`, or
`items`. Each row should include at least `id` and `name`, plus nutrition fields
either at the top level or inside `nutrition`:

```json
{
  "foods": [
    {
      "id": "wendys-chili-small",
      "restaurant": "Wendy's",
      "name": "Small Chili",
      "serving_size": 1,
      "serving_unit": "serving",
      "nutrition": {
        "calories": 240,
        "protein": 16,
        "carbs": 22,
        "fat": 11,
        "fiber": 5,
        "sugar": 9,
        "sodium": 910,
        "saturated_fat": 4
      }
    }
  ]
}
```

### 6. Deploy to GitHub Pages

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
├── data/               # Bundled restaurant/home nutrition tables
├── css/
│   └── app.css         # All styles
└── js/
    ├── app.js          # Router + bootstrap
    ├── db.js           # IndexedDB wrapper
    ├── auth.js         # OAuth connection helpers for cloud backup
    ├── sync.js         # OneDrive and Google Drive backup/restore
    ├── onboarding.js   # First-run flow
    ├── food.js         # USDA/backend API + food utilities
    ├── log.js          # Meal/water/weight logging screen
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
| `weight_log` | Daily weigh-ins                       |
| `foods`      | Cached USDA foods + custom/backend foods |
| `recipes`    | User-defined dishes                   |
| `targets`    | Daily nutrition/water goals           |
| `sync_meta`  | Reserved for future sync metadata     |

No user data is stored in GitHub or sent to any BiteWise server.

---

## License

GPL-3.0 — see LICENSE file.
