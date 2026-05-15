// food.js - USDA FoodData Central API integration
// API documentation: https://fdc.nal.usda.gov/api-guide.html
// The FoodData Central API is free and does not require an API key for basic search.
// Rate limits apply: be conservative with requests and cache results locally.

import { Foods, SyncMeta } from './db.js';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';
const USDA_SCHEMA_VERSION = 2;
const USDA_API_KEY_META = 'usda_api_key';
const BACKEND_FOOD_SOURCE_META = 'backend_food_source_url';
const BUNDLED_FOOD_SOURCES = [
  {
    id: 'wendys_core_menu',
    label: "Wendy's",
    brand: "Wendy's",
    category: 'Core Menu',
    url: 'data/wendys_core_menu.csv',
    format: 'csv'
  }
];
let configPromise = null;
const bundledFoodCache = new Map();

async function getOptionalConfig() {
  if (!configPromise) {
    configPromise = import('./config.js')
      .then(module => module.CONFIG || {})
      .catch(() => ({}));
  }
  return configPromise;
}

async function getUSDAApiKey() {
  const saved = await SyncMeta.get(USDA_API_KEY_META);
  const config = await getOptionalConfig();
  return saved?.value || config.USDA_API_KEY || 'DEMO_KEY';
}

async function getUSDAApiKeyStatus() {
  const saved = await SyncMeta.get(USDA_API_KEY_META);
  return {
    hasCustomKey: !!saved?.value,
    keyPreview: saved?.value ? `${saved.value.slice(0, 4)}...${saved.value.slice(-4)}` : null
  };
}

async function saveUSDAApiKey(apiKey) {
  const value = apiKey.trim();
  if (!value) {
    await SyncMeta.remove(USDA_API_KEY_META);
    return;
  }
  await SyncMeta.set(USDA_API_KEY_META, { value });
}

async function validateUSDAApiKey(apiKey) {
  const value = apiKey.trim();
  if (!value) return false;

  const params = new URLSearchParams({
    api_key: value,
    query: 'apple',
    pageSize: 1
  });
  const response = await fetch(`${USDA_BASE}/foods/search?${params}`);
  if (!response.ok) return false;

  const data = await response.json();
  return !data.error && Array.isArray(data.foods);
}

async function clearUSDAApiKey() {
  await SyncMeta.remove(USDA_API_KEY_META);
}

async function getBackendFoodSourceUrl() {
  const saved = await SyncMeta.get(BACKEND_FOOD_SOURCE_META);
  const config = await getOptionalConfig();
  return saved?.value || config.BACKEND_FOOD_SEARCH_URL || '';
}

async function getBackendFoodSourceStatus() {
  const url = await getBackendFoodSourceUrl();
  return {
    enabled: !!url,
    url
  };
}

async function saveBackendFoodSourceUrl(url) {
  const value = (url || '').trim();
  if (!value) {
    await clearBackendFoodSourceUrl();
    return;
  }

  try {
    new URL(value);
  } catch (err) {
    throw new Error('Enter a valid backend search URL.');
  }

  await SyncMeta.set(BACKEND_FOOD_SOURCE_META, { value });
}

async function clearBackendFoodSourceUrl() {
  await SyncMeta.remove(BACKEND_FOOD_SOURCE_META);
}

async function validateBackendFoodSourceUrl(url) {
  const value = (url || '').trim();
  if (!value) return false;

  try {
    const testUrl = new URL(value);
    testUrl.searchParams.set('q', 'apple');
    testUrl.searchParams.set('page', 1);
    testUrl.searchParams.set('pageSize', 1);

    const response = await fetch(testUrl.toString());
    if (!response.ok) return false;

    const payload = await response.json();
    return Array.isArray(payload) ||
      Array.isArray(payload?.foods) ||
      Array.isArray(payload?.results) ||
      Array.isArray(payload?.items);
  } catch (err) {
    return false;
  }
}

// Nutrient ID mappings from FoodData Central
// Full list: https://fdc.nal.usda.gov/food-details/1104358/nutrients
const NUTRIENT_IDS = {
  calories:       1008,  // Energy (kcal)
  protein:        1003,  // Protein (g)
  fat:            1004,  // Total lipid (fat) (g)
  carbs:          1005,  // Carbohydrate, by difference (g)
  fiber:          1079,  // Fiber, total dietary (g)
  sugar:          2000,  // Sugars, total including NLEA (g)
  sodium:         1093,  // Sodium (mg)
  saturated_fat:  1258   // Fatty acids, total saturated (g)
};

const GRAMS_PER_OUNCE = 28.349523125;

function normalizeServingUnit(unit) {
  const normalized = (unit || '').trim().toLowerCase();
  if (['g', 'grm', 'gram', 'grams'].includes(normalized)) return 'g';
  if (['oz', 'ounce', 'ounces'].includes(normalized)) return 'oz';
  if (['ml', 'mlt', 'milliliter', 'milliliters'].includes(normalized)) return 'ml';
  return unit || 'g';
}

function gramWeightForServing(size, unit) {
  const amount = parseFloat(size);
  if (!amount || amount <= 0) return null;

  const normalizedUnit = normalizeServingUnit(unit);
  if (normalizedUnit === 'g') return amount;
  if (normalizedUnit === 'oz') return amount * GRAMS_PER_OUNCE;
  if (normalizedUnit === 'ml') return amount;
  return null;
}

function scaleNutritionValues(nutrition, factor) {
  const scaled = {};
  for (const [key, value] of Object.entries(nutrition)) {
    scaled[key] = value !== null ? Math.round(value * factor * 10) / 10 : null;
  }
  return scaled;
}

function nutritionPerServing(nutrition, servingSize, servingUnit) {
  const servingGrams = gramWeightForServing(servingSize, servingUnit);
  return servingGrams ? scaleNutritionValues(nutrition, servingGrams / 100) : nutrition;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item';
}

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some(cell => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some(cell => cell.trim() !== '')) rows.push(row);

  const headers = rows.shift()?.map(header => header.trim()) || [];
  return rows.map(cells => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] || '').trim();
    });
    return record;
  });
}

function parseAmount(value) {
  if (!value) return 1;

  const parts = value.trim().split(/\s+/);
  return parts.reduce((sum, part) => {
    if (part.includes('/')) {
      const [num, den] = part.split('/').map(Number);
      return den ? sum + (num / den) : sum;
    }
    const parsed = parseFloat(part);
    return Number.isNaN(parsed) ? sum : sum + parsed;
  }, 0) || 1;
}

function parseHouseholdPortion(text, gramWeight) {
  if (!text || !gramWeight) return null;

  const cleaned = text.replace(/\([^)]*\)/g, '').trim();
  const match = cleaned.match(/^((?:\d+(?:\.\d+)?|\d+\/\d+)(?:\s+\d+\/\d+)?)?\s*(.+)$/);
  if (!match) return null;

  const unit = match[2].trim();
  if (!unit) return null;

  return {
    id: 'household',
    amount: parseAmount(match[1]),
    unit,
    gram_weight: gramWeight
  };
}

// ─── USDA Search ──────────────────────────────────────────────────────────────

/**
 * Search USDA FoodData Central for foods matching a query string.
 * Returns an array of normalized food objects.
 *
 * @param {string} query - Search term (e.g., "apple", "cheddar cheese")
 * @param {number} pageSize - Number of results to return (max 50)
 * @param {number} pageNumber - 1-based USDA page number
 * @returns {Promise<Array>} Normalized food objects
 */
async function searchUSDA(query, pageSize = 20, pageNumber = 1) {
  if (!query || query.trim().length < 2) return [];

  const apiKey = await getUSDAApiKey();
  const params = new URLSearchParams({
    api_key: apiKey,
    query: query.trim(),
    pageSize,
    pageNumber,
    dataType: 'Foundation,SR Legacy,Branded',  // Include common and branded foods
    sortBy: 'dataType.keyword',
    sortOrder: 'asc'
  });

  const response = await fetch(`${USDA_BASE}/foods/search?${params}`);

  if (!response.ok) {
    if (response.status === 429) throw new Error('USDA API rate limit reached. Try again in a moment.');
    throw new Error(`USDA search failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'USDA search failed.');
  }
  return (data.foods || []).map(normalizeUSDAFood);
}

/**
 * Fetch detailed nutrition info for a specific food by its USDA fdcId.
 * Caches the result in IndexedDB to reduce repeated API calls.
 *
 * @param {string|number} fdcId - USDA FoodData Central ID
 * @returns {Promise<Object>} Normalized food object with full nutrition
 */
async function getFoodDetail(fdcId) {
  const id = `usda_${fdcId}`;

  // Check local cache first
  const cached = await Foods.get(id);
  if (cached?.usda_schema_version === USDA_SCHEMA_VERSION) return cached;

  const params = new URLSearchParams({ api_key: await getUSDAApiKey() });
  const response = await fetch(`${USDA_BASE}/food/${fdcId}?${params}`);

  if (!response.ok) throw new Error(`USDA food detail failed: ${response.status}`);

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'USDA food detail failed.');
  }
  const normalized = normalizeUSDAFoodDetail(data);

  // Cache locally
  await Foods.save(normalized);
  return normalized;
}

// ─── Backend Food Tables ─────────────────────────────────────────────────────

function extractBackendFoodRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.foods)) return payload.foods;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeBackendFood(item) {
  const rawId = item.id || item.food_id || item.menu_item_id || item.sku || item.name;
  const sourceName = item.source_label || item.restaurant || item.brand || item.table || item.source || 'Backend';
  const servingSize = item.serving_size ?? item.servingSize ?? item.servingQty ?? 1;
  const servingUnit = normalizeServingUnit(item.serving_unit || item.servingUnit || item.unit || 'serving');
  const nutrition = item.nutrition || {};

  return {
    id: `backend_${String(sourceName).toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${String(rawId).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    source: 'backend',
    source_label: sourceName,
    backend_id: rawId,
    name: item.name || item.food_name || item.description || 'Unnamed food',
    brand: item.brand || item.restaurant || item.vendor || null,
    category: item.category || item.menu_category || item.table || null,
    serving_size: numberOrNull(servingSize) ?? 1,
    serving_unit: servingUnit,
    portions: Array.isArray(item.portions) ? item.portions : [],
    nutrition: {
      calories:      numberOrNull(nutrition.calories ?? item.calories),
      protein:       numberOrNull(nutrition.protein ?? item.protein),
      fat:           numberOrNull(nutrition.fat ?? item.fat),
      carbs:         numberOrNull(nutrition.carbs ?? nutrition.carbohydrates ?? item.carbs ?? item.carbohydrates),
      fiber:         numberOrNull(nutrition.fiber ?? item.fiber),
      sugar:         numberOrNull(nutrition.sugar ?? item.sugar),
      sodium:        numberOrNull(nutrition.sodium ?? item.sodium),
      saturated_fat: numberOrNull(nutrition.saturated_fat ?? nutrition.saturatedFat ?? item.saturated_fat ?? item.saturatedFat)
    },
    fetched_at: new Date().toISOString()
  };
}

function normalizeBundledFood(row, source) {
  const name = row.name || row.Name || row['Menu Item'] || row.food_name || row.description;
  const saltGrams = numberOrNull(row['Salt (g)'] ?? row.salt_g ?? row.salt);

  return {
    id: `bundled_${source.id}_${slugify(name)}`,
    source: 'bundled',
    source_label: source.label,
    backend_id: `${source.id}:${name}`,
    name: name || 'Unnamed food',
    brand: row.brand || source.brand || source.label,
    category: row.category || source.category || null,
    serving_size: numberOrNull(row.serving_size ?? row.servingSize) ?? 1,
    serving_unit: normalizeServingUnit(row.serving_unit || row.servingUnit || 'serving'),
    portions: [],
    nutrition: {
      calories:      numberOrNull(row.calories ?? row['Energy (kcal)']),
      protein:       numberOrNull(row.protein ?? row['Protein (g)']),
      fat:           numberOrNull(row.fat ?? row['Fat (g)']),
      carbs:         numberOrNull(row.carbs ?? row.carbohydrates ?? row['Carbohydrates (g)']),
      fiber:         numberOrNull(row.fiber ?? row.fibre ?? row['Fibre (g)']),
      sugar:         numberOrNull(row.sugar ?? row.sugars ?? row['Sugars (g)']),
      sodium:        numberOrNull(row.sodium ?? row['Sodium (mg)']) ?? (saltGrams !== null ? Math.round(saltGrams * 400) : null),
      saturated_fat: numberOrNull(row.saturated_fat ?? row.saturatedFat ?? row['Saturated Fat (g)'])
    },
    fetched_at: new Date().toISOString()
  };
}

async function loadBundledFoodSource(source) {
  if (bundledFoodCache.has(source.id)) return bundledFoodCache.get(source.id);

  const promise = fetch(source.url)
    .then(response => {
      if (!response.ok) throw new Error(`Bundled food source failed: ${source.url}`);
      return response.text();
    })
    .then(text => parseCSV(text).map(row => normalizeBundledFood(row, source)));

  bundledFoodCache.set(source.id, promise);
  return promise;
}

async function searchBundledFoods(query, { page = 1, pageSize = 20 } = {}) {
  if (!query || query.trim().length < 2) return [];

  const needle = query.trim().toLowerCase();
  const compactNeedle = normalizeSearchText(query);
  const foods = (await Promise.all(
    BUNDLED_FOOD_SOURCES.map(source => loadBundledFoodSource(source).catch(err => {
      console.warn('Bundled food source unavailable:', err);
      return [];
    }))
  )).flat();

  const matches = foods.filter(food => [
    food.name,
    food.brand,
    food.category,
    food.source_label
  ].some(value => {
    const text = String(value || '').toLowerCase();
    return text.includes(needle) || normalizeSearchText(text).includes(compactNeedle);
  }));

  const start = (page - 1) * pageSize;
  return matches.slice(start, start + pageSize);
}

async function searchBackendFoods(query, { page = 1, pageSize = 20, endpointUrl = null } = {}) {
  if (!query || query.trim().length < 2) return [];

  const configuredUrl = endpointUrl || await getBackendFoodSourceUrl();
  if (!configuredUrl) return [];

  const url = new URL(configuredUrl);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('page', page);
  url.searchParams.set('pageSize', pageSize);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Backend food search failed: ${response.status}`);

  const payload = await response.json();
  return extractBackendFoodRows(payload).map(normalizeBackendFood);
}

async function saveFavoriteFood(food) {
  const existing = await Foods.get(food.id);
  const saved = {
    ...(existing || {}),
    ...food,
    favorite: true,
    favorite_at: existing?.favorite_at || new Date().toISOString(),
    saved_at: existing?.saved_at || new Date().toISOString()
  };
  await Foods.save(saved);
  return saved;
}

async function removeFavoriteFood(food) {
  const existing = await Foods.get(food.id);
  if (!existing) return food;

  const updated = {
    ...existing,
    favorite: false,
    favorite_at: null
  };
  await Foods.save(updated);
  return updated;
}

async function getFavoriteFoods() {
  const favorites = (await Foods.getFavorites()).map(migrateCachedUSDAFood);
  await Promise.all(
    favorites
      .filter(f => f.source === 'usda' && f.usda_schema_version === USDA_SCHEMA_VERSION)
      .map(f => Foods.save(f).catch(() => null))
  );
  return favorites;
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a USDA search result item to BiteWise's internal food schema.
 */
function normalizeUSDAFood(item) {
  const servingSize = item.servingSize || 100;
  const servingUnit = normalizeServingUnit(item.servingSizeUnit || 'g');
  const nutrition = nutritionPerServing(extractNutrients(item.foodNutrients || []), servingSize, servingUnit);

  return {
    id: `usda_${item.fdcId}`,
    fdc_id: item.fdcId,
    source: 'usda',
    name: item.description,
    brand: item.brandOwner || item.brandName || null,
    category: item.foodCategory || null,
    data_type: item.dataType,
    serving_size: servingSize,
    serving_unit: servingUnit,
    portions: [
      parseHouseholdPortion(item.householdServingFullText, gramWeightForServing(servingSize, servingUnit))
    ].filter(Boolean),
    nutrition,
    saved_at: new Date().toISOString(),
    usda_schema_version: USDA_SCHEMA_VERSION
  };
}

/**
 * Normalize a USDA food detail response to BiteWise's internal food schema.
 */
function normalizeUSDAFoodDetail(item) {
  const servingSize = item.servingSize || 100;
  const servingUnit = normalizeServingUnit(item.servingSizeUnit || 'g');
  const servingGramWeight = gramWeightForServing(servingSize, servingUnit);
  const nutrition = nutritionPerServing(extractNutrients(item.foodNutrients || []), servingSize, servingUnit);

  // Prefer labeled portions if available
  const portions = (item.foodPortions || []).map(p => ({
    id: p.id,
    amount: p.amount,
    unit: p.measureUnit?.name || p.portionDescription || 'serving',
    gram_weight: p.gramWeight
  }));
  const householdPortion = parseHouseholdPortion(item.householdServingFullText, servingGramWeight);
  if (
    householdPortion &&
    !portions.some(p => (p.unit || '').toLowerCase() === householdPortion.unit.toLowerCase())
  ) {
    portions.unshift(householdPortion);
  }

  return {
    id: `usda_${item.fdcId}`,
    fdc_id: item.fdcId,
    source: 'usda',
    name: item.description,
    brand: item.brandOwner || item.brandName || null,
    category: item.foodCategory?.description || null,
    data_type: item.dataType,
    serving_size: servingSize,
    serving_unit: servingUnit,
    portions,
    nutrition,
    saved_at: new Date().toISOString(),
    usda_schema_version: USDA_SCHEMA_VERSION,
    fetched_at: new Date().toISOString()
  };
}

function migrateCachedUSDAFood(food) {
  if (food.source !== 'usda' || food.usda_schema_version === USDA_SCHEMA_VERSION) {
    return food;
  }

  const servingSize = food.serving_size || 100;
  const servingUnit = normalizeServingUnit(food.serving_unit || 'g');

  return {
    ...food,
    serving_unit: servingUnit,
    nutrition: nutritionPerServing(food.nutrition || {}, servingSize, servingUnit),
    usda_schema_version: USDA_SCHEMA_VERSION
  };
}

/**
 * Extract BiteWise-relevant nutrients from a USDA nutrient array.
 * Both search results and detail responses use the same nutrient structure.
 */
function extractNutrients(nutrients) {
  const result = {};

  for (const [key, id] of Object.entries(NUTRIENT_IDS)) {
    const match = nutrients.find(n => n.nutrientId === id || n.nutrient?.id === id);
    result[key] = match ? Math.round((match.value || match.amount || 0) * 10) / 10 : null;
  }

  return result;
}

// ─── Serving Size Scaling ─────────────────────────────────────────────────────

/**
 * Scale nutrition values from the food's base serving to a user-specified quantity.
 *
 * @param {Object} nutrition - Base nutrition object (per serving_size)
 * @param {number} baseGrams - The gram weight of the base serving
 * @param {number} targetGrams - The gram weight of the user's actual serving
 * @returns {Object} Scaled nutrition object
 */
function scaleNutrition(nutrition, baseGrams, targetGrams) {
  const factor = targetGrams / baseGrams;
  const scaled = {};

  for (const [key, value] of Object.entries(nutrition)) {
    scaled[key] = value !== null ? Math.round(value * factor * 10) / 10 : null;
  }

  return scaled;
}

// ─── Custom Food Creation ─────────────────────────────────────────────────────

/**
 * Create and save a custom (user-defined) food entry.
 * Custom foods are stored locally only and never sent to USDA.
 *
 * @param {Object} foodData - Food fields including name and nutrition
 * @returns {Promise<Object>} Saved food object
 */
async function createCustomFood(foodData) {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const food = {
    id,
    source: 'custom',
    name: foodData.name,
    brand: foodData.brand || null,
    category: foodData.category || null,
    serving_size: foodData.serving_size || 1,
    serving_unit: foodData.serving_unit || 'serving',
    nutrition: {
      calories:       foodData.calories ?? null,
      protein:        foodData.protein ?? null,
      fat:            foodData.fat ?? null,
      carbs:          foodData.carbs ?? null,
      fiber:          foodData.fiber ?? null,
      sugar:          foodData.sugar ?? null,
      sodium:         foodData.sodium ?? null,
      saturated_fat:  foodData.saturated_fat ?? null
    },
    created_at: new Date().toISOString()
  };

  await Foods.save(food);
  return food;
}

// ─── Combined Search (USDA + Local) ──────────────────────────────────────────

/**
 * Search both USDA and local custom foods, merging results.
 * Local results appear first.
 *
 * @param {string} query
 * @returns {Promise<Array>} Combined and deduplicated food results
 */
async function searchFoods(query, { page = 1, pageSize = 20 } = {}) {
  const localResults = (await Foods.searchLocal(query)).map(migrateCachedUSDAFood);

  await Promise.all(
    localResults
      .filter(f => f.source === 'usda' && f.usda_schema_version === USDA_SCHEMA_VERSION)
      .map(f => Foods.save(f).catch(() => null))
  );

  const orderedLocalResults = page === 1
    ? [
        ...localResults.filter(f => f.favorite),
        ...localResults.filter(f => !f.favorite)
      ]
    : [];

  const bundled = await searchBundledFoods(query, { page, pageSize });
  const backend = await searchBackendFoods(query, { page, pageSize }).catch(err => {
    console.warn('Backend food search unavailable:', err);
    return [];
  });
  const usda = await searchUSDA(query, pageSize, page).catch(err => {
    if (orderedLocalResults.length || bundled.length || backend.length) {
      console.warn('USDA search unavailable; showing local/bundled/backend results:', err);
      return [];
    }
    throw err;
  });

  // Deduplicate: if a USDA food is already cached locally, prefer the cached version
  const localIds = new Set(localResults.map(f => f.id));
  const bundledIds = new Set(bundled.map(f => f.id));
  const backendIds = new Set([...bundledIds, ...backend.map(f => f.id)]);
  const filteredUSDA = usda.filter(f => !localIds.has(f.id));
  const filteredBundled = bundled.filter(f => !localIds.has(f.id));
  const filteredBackend = backend.filter(f => !localIds.has(f.id));
  const dedupedUSDA = filteredUSDA.filter(f => !backendIds.has(f.id));

  return page === 1
    ? [...orderedLocalResults, ...filteredBundled, ...filteredBackend, ...dedupedUSDA]
    : [...filteredBundled, ...filteredBackend, ...dedupedUSDA];
}

// ─── Nutrition Summary Utilities ──────────────────────────────────────────────

/**
 * Sum nutrition across an array of food log entries.
 * Returns a single nutrition object with totals.
 *
 * @param {Array} entries - Array of food log entries (each has a .nutrition field)
 * @returns {Object} Summed nutrition totals
 */
function sumNutrition(entries) {
  const totals = {
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    saturated_fat: 0
  };

  for (const entry of entries) {
    if (!entry.nutrition) continue;
    for (const key of Object.keys(totals)) {
      totals[key] += entry.nutrition[key] || 0;
    }
  }

  // Round all values to 1 decimal place
  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 10) / 10;
  }

  return totals;
}

/**
 * Format a nutrition value with its unit for display.
 * @param {string} key - Nutrition key
 * @param {number|null} value
 * @returns {string}
 */
function formatNutrient(key, value) {
  if (value === null || value === undefined) return '--';

  const units = {
    calories: 'kcal',
    protein: 'g',
    fat: 'g',
    carbs: 'g',
    fiber: 'g',
    sugar: 'g',
    sodium: 'mg',
    saturated_fat: 'g'
  };

  return `${value}${units[key] || ''}`;
}

const SNACK_MOTIVATIONS = [
  { value: 'hunger',       label: 'Hunger' },
  { value: 'boredom',      label: 'Boredom' },
  { value: 'stress',       label: 'Stress / Anxiety' },
  { value: 'habit',        label: 'Habit / Routine' },
  { value: 'social',       label: 'Social (others were eating)' },
  { value: 'low_energy',   label: 'Low energy / Fatigue' },
  { value: 'craving',      label: 'Craving (specific taste)' },
  { value: 'reward',       label: 'Reward / Treat' },
  { value: 'post_workout', label: 'Post-workout' },
  { value: 'low_sugar',    label: 'Faint / Low Sugar' },
  { value: 'other',        label: 'Other' }
];

const MEAL_SLOTS = [
  { value: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { value: 'lunch',     label: 'Lunch',     icon: '☀️' },
  { value: 'dinner',    label: 'Dinner',    icon: '🌙' },
  { value: 'snack',     label: 'Snack',     icon: '🍎' }
];

export {
  searchUSDA,
  getFoodDetail,
  getFavoriteFoods,
  clearBackendFoodSourceUrl,
  clearUSDAApiKey,
  getBackendFoodSourceStatus,
  getUSDAApiKeyStatus,
  removeFavoriteFood,
  saveBackendFoodSourceUrl,
  saveUSDAApiKey,
  saveFavoriteFood,
  validateBackendFoodSourceUrl,
  validateUSDAApiKey,
  searchBundledFoods,
  searchBackendFoods,
  searchFoods,
  createCustomFood,
  scaleNutrition,
  sumNutrition,
  formatNutrient,
  SNACK_MOTIVATIONS,
  MEAL_SLOTS
};
