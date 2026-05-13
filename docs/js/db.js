// db.js - IndexedDB wrapper for BiteWise
// All user data is stored locally in IndexedDB. No data is sent to GitHub or any server
// other than the user's chosen cloud backup provider (OneDrive or Google Drive).

const DB_NAME = 'bitewise';
const DB_VERSION = 1;

// Object store definitions
const STORES = {
  PROFILE:      'profile',       // Single record: user identity and preferences
  FOOD_LOG:     'food_log',      // Daily meal entries
  WATER_LOG:    'water_log',     // Daily water intake entries
  FOODS:        'foods',         // Cached USDA food records and user-created foods
  RECIPES:      'recipes',       // User-defined dishes (composite foods)
  TARGETS:      'targets',       // User-defined daily nutrition/water targets
  SYNC_META:    'sync_meta'      // Cloud sync state (tokens stored here, not in GH)
};

let _db = null;

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Open (or create) the IndexedDB database. Returns a Promise resolving to the db instance.
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Profile store - single record keyed by 'user'
      if (!db.objectStoreNames.contains(STORES.PROFILE)) {
        db.createObjectStore(STORES.PROFILE, { keyPath: 'id' });
      }

      // Food log - entries keyed by auto-incremented id, indexed by date and meal slot
      if (!db.objectStoreNames.contains(STORES.FOOD_LOG)) {
        const foodLog = db.createObjectStore(STORES.FOOD_LOG, {
          keyPath: 'id',
          autoIncrement: true
        });
        foodLog.createIndex('by_date', 'date', { unique: false });
        foodLog.createIndex('by_date_meal', ['date', 'meal_slot'], { unique: false });
      }

      // Water log - entries keyed by auto-incremented id, indexed by date
      if (!db.objectStoreNames.contains(STORES.WATER_LOG)) {
        const waterLog = db.createObjectStore(STORES.WATER_LOG, {
          keyPath: 'id',
          autoIncrement: true
        });
        waterLog.createIndex('by_date', 'date', { unique: false });
      }

      // Foods cache - USDA foods and user-created foods
      if (!db.objectStoreNames.contains(STORES.FOODS)) {
        const foods = db.createObjectStore(STORES.FOODS, { keyPath: 'id' });
        foods.createIndex('by_source', 'source', { unique: false }); // 'usda' or 'custom'
        foods.createIndex('by_name', 'name', { unique: false });
      }

      // Recipes store
      if (!db.objectStoreNames.contains(STORES.RECIPES)) {
        const recipes = db.createObjectStore(STORES.RECIPES, {
          keyPath: 'id',
          autoIncrement: true
        });
        recipes.createIndex('by_name', 'name', { unique: false });
      }

      // Targets store - one record per target version (history preserved)
      if (!db.objectStoreNames.contains(STORES.TARGETS)) {
        const targets = db.createObjectStore(STORES.TARGETS, {
          keyPath: 'id',
          autoIncrement: true
        });
        targets.createIndex('by_active', 'active', { unique: false });
      }

      // Sync metadata - stores OAuth tokens, last sync timestamps
      if (!db.objectStoreNames.contains(STORES.SYNC_META)) {
        db.createObjectStore(STORES.SYNC_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB open failed: ${event.target.error}`));
    };
  });
}

// ─── Generic CRUD helpers ─────────────────────────────────────────────────────

/**
 * Write a single record to a store. Overwrites if key exists.
 */
async function put(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read a single record by key.
 */
async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a record by key.
 */
async function remove(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all records in a store.
 */
async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all records matching an index value.
 */
async function getByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get records within an IDBKeyRange on an index.
 */
async function getByIndexRange(storeName, indexName, range) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Profile ──────────────────────────────────────────────────────────────────

const Profile = {
  async get() {
    return get(STORES.PROFILE, 'user');
  },
  async save(profileData) {
    return put(STORES.PROFILE, { id: 'user', ...profileData, updated_at: new Date().toISOString() });
  },
  async exists() {
    const p = await get(STORES.PROFILE, 'user');
    return !!p;
  }
};

// ─── Food Log ─────────────────────────────────────────────────────────────────

/**
 * A food log entry schema:
 * {
 *   id: autoincrement,
 *   date: 'YYYY-MM-DD',
 *   meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack',
 *   food_id: string (USDA fdcId or custom id),
 *   food_name: string,
 *   serving_qty: number,
 *   serving_unit: string,
 *   nutrition: { calories, protein, carbs, fat, fiber, sugar, sodium, saturated_fat },
 *   // Snack-only fields:
 *   snack_relative_meal: 'breakfast' | 'lunch' | 'dinner' | null,
 *   snack_timing: 'before' | 'after' | null,
 *   snack_motivation: string | null,
 *   logged_at: ISO string
 * }
 */
const FoodLog = {
  async add(entry) {
    return put(STORES.FOOD_LOG, { ...entry, logged_at: new Date().toISOString() });
  },
  async update(entry) {
    return put(STORES.FOOD_LOG, { ...entry, updated_at: new Date().toISOString() });
  },
  async delete(id) {
    return remove(STORES.FOOD_LOG, id);
  },
  async getByDate(dateStr) {
    return getByIndex(STORES.FOOD_LOG, 'by_date', dateStr);
  },
  async getByDateRange(startDate, endDate) {
    const range = IDBKeyRange.bound(startDate, endDate);
    return getByIndexRange(STORES.FOOD_LOG, 'by_date', range);
  },
  async getAll() {
    return getAll(STORES.FOOD_LOG);
  }
};

// ─── Water Log ────────────────────────────────────────────────────────────────

/**
 * A water log entry schema:
 * {
 *   id: autoincrement,
 *   date: 'YYYY-MM-DD',
 *   amount: number,
 *   unit: 'oz' | 'ml',
 *   logged_at: ISO string
 * }
 */
const WaterLog = {
  async add(entry) {
    return put(STORES.WATER_LOG, { ...entry, logged_at: new Date().toISOString() });
  },
  async delete(id) {
    return remove(STORES.WATER_LOG, id);
  },
  async getByDate(dateStr) {
    return getByIndex(STORES.WATER_LOG, 'by_date', dateStr);
  },
  async getByDateRange(startDate, endDate) {
    const range = IDBKeyRange.bound(startDate, endDate);
    return getByIndexRange(STORES.WATER_LOG, 'by_date', range);
  },
  async getTotalForDate(dateStr, unit) {
    const entries = await getByIndex(STORES.WATER_LOG, 'by_date', dateStr);
    return entries
      .filter(e => e.unit === unit)
      .reduce((sum, e) => sum + e.amount, 0);
  }
};

// ─── Foods Cache ──────────────────────────────────────────────────────────────

const Foods = {
  async save(food) {
    return put(STORES.FOODS, food);
  },
  async get(id) {
    return get(STORES.FOODS, id);
  },
  async getAll() {
    return getAll(STORES.FOODS);
  },
  async getCustom() {
    return getByIndex(STORES.FOODS, 'by_source', 'custom');
  },
  async getFavorites() {
    const all = await getAll(STORES.FOODS);
    return all
      .filter(f => f.favorite)
      .sort((a, b) => (b.favorite_at || '').localeCompare(a.favorite_at || ''));
  },
  async searchLocal(query) {
    const all = await getAll(STORES.FOODS);
    const q = query.toLowerCase();
    return all.filter(f =>
      f.name.toLowerCase().includes(q) ||
      (f.brand || '').toLowerCase().includes(q)
    );
  }
};

// ─── Recipes ──────────────────────────────────────────────────────────────────

const Recipes = {
  async save(recipe) {
    return put(STORES.RECIPES, { ...recipe, updated_at: new Date().toISOString() });
  },
  async get(id) {
    return get(STORES.RECIPES, id);
  },
  async getAll() {
    return getAll(STORES.RECIPES);
  },
  async delete(id) {
    return remove(STORES.RECIPES, id);
  }
};

// ─── Targets ─────────────────────────────────────────────────────────────────

/**
 * A targets record:
 * {
 *   id: autoincrement,
 *   active: 1 | 0,
 *   calories: number | null,
 *   protein: number | null,
 *   carbs: number | null,
 *   fat: number | null,
 *   water: number | null,
 *   water_unit: 'oz' | 'ml' | null,
 *   set_at: ISO string
 * }
 */
const Targets = {
  async getActive() {
    const all = await getByIndex(STORES.TARGETS, 'by_active', 1);
    return all.length ? all[all.length - 1] : null;
  },
  async save(targets) {
    // Deactivate any existing active targets first
    const active = await this.getActive();
    if (active) {
      await put(STORES.TARGETS, { ...active, active: 0 });
    }
    return put(STORES.TARGETS, { ...targets, active: 1, set_at: new Date().toISOString() });
  }
};

// ─── Sync Metadata ────────────────────────────────────────────────────────────

const SyncMeta = {
  async get(key) {
    return get(STORES.SYNC_META, key);
  },
  async set(key, value) {
    return put(STORES.SYNC_META, { key, ...value });
  },
  async remove(key) {
    return remove(STORES.SYNC_META, key);
  }
};

// ─── Full Export (for cloud backup) ──────────────────────────────────────────

/**
 * Export all user data as a single JSON object.
 * This is what gets written to OneDrive or Google Drive.
 */
async function exportAllData() {
  const [profile, foodLog, waterLog, foods, recipes, targets] = await Promise.all([
    getAll(STORES.PROFILE),
    getAll(STORES.FOOD_LOG),
    getAll(STORES.WATER_LOG),
    getAll(STORES.FOODS),
    getAll(STORES.RECIPES),
    getAll(STORES.TARGETS)
  ]);

  return {
    schema_version: DB_VERSION,
    exported_at: new Date().toISOString(),
    profile,
    food_log: foodLog,
    water_log: waterLog,
    foods,
    recipes,
    targets
  };
}

/**
 * Import data from a cloud backup, replacing local data.
 * Sync metadata (OAuth tokens) is intentionally excluded from import.
 */
async function importAllData(data) {
  const db = await openDB();

  const storesToImport = [
    [STORES.PROFILE, data.profile],
    [STORES.FOOD_LOG, data.food_log],
    [STORES.WATER_LOG, data.water_log],
    [STORES.FOODS, data.foods],
    [STORES.RECIPES, data.recipes],
    [STORES.TARGETS, data.targets]
  ];

  for (const [storeName, records] of storesToImport) {
    if (!records) continue;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of records) {
        store.put(record);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Return today's date as YYYY-MM-DD in local time.
 */
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export {
  openDB,
  Profile,
  FoodLog,
  WaterLog,
  Foods,
  Recipes,
  Targets,
  SyncMeta,
  exportAllData,
  importAllData,
  todayString
};
