# BiteWise

Smart food and water tracking. Your data stays on your device.

## What It Does

BiteWise is a progressive web app (PWA) for tracking daily meals and water intake.
Food nutrition data is pulled from the USDA FoodData Central database.
All data is stored locally using IndexedDB. Backups go directly to your personal
browser profile. Cloud backup is temporarily disabled until the OAuth flow is fixed.

## Features

- **Food logging** — Search USDA FoodData Central, saved/custom foods, or your own backend menu tables
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
and enter it in Settings -> USDA API key, or copy `docs/js/config.example.js` to
`docs/js/config.js` and set `USDA_API_KEY`.

### 3. Bundled food tables

BiteWise can search static nutrition tables stored in `docs/data/`. The Wendy's
core menu is included as the first bundled source at:

```text
docs/data/wendys_core_menu.csv
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

Bundled foods are merged into Log search results before the configurable backend
endpoint and USDA results.

### 4. Backend food tables (optional)

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

### 5. Deploy to GitHub Pages

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
    ├── auth.js         # Disabled OAuth implementation kept for later
    ├── sync.js         # Disabled cloud sync implementation kept for later
    ├── onboarding.js   # First-run flow
    ├── food.js         # USDA/backend API + food utilities
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
| `foods`      | Cached USDA foods + custom/backend foods |
| `recipes`    | User-defined dishes                   |
| `targets`    | Daily nutrition/water goals           |
| `sync_meta`  | Reserved for future sync metadata     |

No user data is stored in GitHub or sent to any BiteWise server.

---

## License

GPL-3.0 — see LICENSE file.
