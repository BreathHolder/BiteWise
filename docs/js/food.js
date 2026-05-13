// food.js - USDA FoodData Central API integration
// API documentation: https://fdc.nal.usda.gov/api-guide.html
// The FoodData Central API is free and does not require an API key for basic search.
// Rate limits apply: be conservative with requests and cache results locally.

import { Foods } from './db.js';
import { CONFIG } from './config.js';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

// Uses the key from config.js. DEMO_KEY allows 1,000 requests/hour and 10,000/day,
// which is sufficient for personal use. Register a free key at https://api.data.gov/signup/
// and set USDA_API_KEY in your config.js for higher limits.
const API_KEY = CONFIG.USDA_API_KEY || 'DEMO_KEY';

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

// ─── USDA Search ──────────────────────────────────────────────────────────────

/**
 * Search USDA FoodData Central for foods matching a query string.
 * Returns an array of normalized food objects.
 *
 * @param {string} query - Search term (e.g., "apple", "cheddar cheese")
 * @param {number} pageSize - Number of results to return (max 50)
 * @returns {Promise<Array>} Normalized food objects
 */
async function searchUSDA(query, pageSize = 20) {
  if (!query || query.trim().length < 2) return [];

  const params = new URLSearchParams({
    api_key: API_KEY,
    query: query.trim(),
    pageSize,
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
  if (cached) return cached;

  const params = new URLSearchParams({ api_key: API_KEY });
  const response = await fetch(`${USDA_BASE}/food/${fdcId}?${params}`);

  if (!response.ok) throw new Error(`USDA food detail failed: ${response.status}`);

  const data = await response.json();
  const normalized = normalizeUSDAFoodDetail(data);

  // Cache locally
  await Foods.save(normalized);
  return normalized;
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize a USDA search result item to BiteWise's internal food schema.
 */
function normalizeUSDAFood(item) {
  const nutrition = extractNutrients(item.foodNutrients || []);

  return {
    id: `usda_${item.fdcId}`,
    fdc_id: item.fdcId,
    source: 'usda',
    name: item.description,
    brand: item.brandOwner || item.brandName || null,
    category: item.foodCategory || null,
    data_type: item.dataType,
    serving_size: item.servingSize || 100,
    serving_unit: item.servingSizeUnit || 'g',
    nutrition
  };
}

/**
 * Normalize a USDA food detail response to BiteWise's internal food schema.
 */
function normalizeUSDAFoodDetail(item) {
  const nutrition = extractNutrients(item.foodNutrients || []);

  // Prefer labeled portions if available
  const portions = (item.foodPortions || []).map(p => ({
    id: p.id,
    amount: p.amount,
    unit: p.measureUnit?.name || p.portionDescription || 'serving',
    gram_weight: p.gramWeight
  }));

  return {
    id: `usda_${item.fdcId}`,
    fdc_id: item.fdcId,
    source: 'usda',
    name: item.description,
    brand: item.brandOwner || item.brandName || null,
    category: item.foodCategory?.description || null,
    data_type: item.dataType,
    serving_size: item.servingSize || 100,
    serving_unit: item.servingSizeUnit || 'g',
    portions,
    nutrition,
    fetched_at: new Date().toISOString()
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
async function searchFoods(query) {
  const [local, usda] = await Promise.allSettled([
    Foods.searchLocal(query),
    searchUSDA(query)
  ]);

  const localResults = local.status === 'fulfilled' ? local.value : [];
  const usdaResults = usda.status === 'fulfilled' ? usda.value : [];

  // Deduplicate: if a USDA food is already cached locally, prefer the cached version
  const localIds = new Set(localResults.map(f => f.id));
  const filteredUSDA = usdaResults.filter(f => !localIds.has(f.id));

  return [...localResults, ...filteredUSDA];
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
  searchFoods,
  createCustomFood,
  scaleNutrition,
  sumNutrition,
  formatNutrient,
  SNACK_MOTIVATIONS,
  MEAL_SLOTS
};
