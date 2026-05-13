// log.js - Today's food and water log screen

import { FoodLog, WaterLog, Targets, Profile, todayString } from './db.js';
import { searchFoods, getFoodDetail, sumNutrition, formatNutrient, SNACK_MOTIVATIONS, MEAL_SLOTS } from './food.js';
import { showToast } from './app.js';

// ─── Log Screen Renderer ──────────────────────────────────────────────────────

const LogScreen = {
  date: null,
  waterUnit: 'oz',
  searchTimeout: null,

  getServingGrams(food, qty, unit) {
    const amount = parseFloat(qty);
    if (!amount || amount <= 0) return null;

    const normalizedUnit = (unit || '').trim().toLowerCase();

    if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams') {
      return amount;
    }

    if (normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') {
      return amount * 28.349523125;
    }

    const portion = (food.portions || []).find(p => {
      const portionUnit = (p.unit || '').trim().toLowerCase();
      return portionUnit === normalizedUnit && p.gram_weight;
    });

    if (portion) {
      const portionAmount = parseFloat(portion.amount) || 1;
      return amount * (portion.gram_weight / portionAmount);
    }

    return null;
  },

  getBaseServingGrams(food) {
    const baseSize = parseFloat(food.serving_size) || 1;
    const baseUnit = food.serving_unit || 'g';
    return this.getServingGrams(food, baseSize, baseUnit) || baseSize;
  },

  scaleFoodNutrition(food, qty, unit) {
    const targetGrams = this.getServingGrams(food, qty, unit);
    const baseGrams = this.getBaseServingGrams(food);
    const factor = targetGrams && baseGrams
      ? targetGrams / baseGrams
      : parseFloat(qty) / food.serving_size;
    const nutrition = {};

    for (const [k, v] of Object.entries(food.nutrition)) {
      nutrition[k] = v !== null ? Math.round(v * factor * 10) / 10 : null;
    }

    return nutrition;
  },

  async render(container) {
    this.date = todayString();
    const profile = await Profile.get();
    this.waterUnit = profile?.water_unit || 'oz';

    const [entries, waterEntries, targets] = await Promise.all([
      FoodLog.getByDate(this.date),
      WaterLog.getByDate(this.date),
      Targets.getActive()
    ]);

    const today = new Date();
    const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const totals = sumNutrition(entries);
    const waterTotal = waterEntries.reduce((s, e) => s + (e.unit === this.waterUnit ? e.amount : 0), 0);
    const waterTarget = targets?.water || null;

    container.innerHTML = `
      <div class="page-header">
        <h1>Today's Log</h1>
        <div class="date-label">${dateLabel}</div>
      </div>

      <div class="page-content" id="log-scroll">
        <!-- Daily Summary Card -->
        <div style="padding:16px 16px 0;">
          <div class="card summary-card fade-up">
            <div class="summary-card-label">Calories today</div>
            <div class="summary-card-value">${Math.round(totals.calories)}</div>
            <div class="summary-card-sub">
              ${targets?.calories ? `of ${targets.calories} kcal goal` : 'No calorie target set'}
            </div>
          </div>
        </div>

        <!-- Macro Bars -->
        <div class="card" style="margin:12px 16px 0;">
          <div class="macro-bars" style="padding-top:16px;">
            ${this.renderMacroBar('Protein', 'protein', totals.protein, targets?.protein)}
            ${this.renderMacroBar('Carbs', 'carbs', totals.carbs, targets?.carbs)}
            ${this.renderMacroBar('Fat', 'fat', totals.fat, targets?.fat)}
          </div>
        </div>

        <!-- Water Tracker -->
        <div class="card" style="margin:12px 16px 0;">
          <div class="water-tracker">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <span class="display-sm" style="font-size:1rem;">💧 Water</span>
              <span style="font-size:0.82rem;color:var(--text-muted);">
                ${waterTotal}${this.waterUnit}${waterTarget ? ` / ${waterTarget}${this.waterUnit}` : ''}
              </span>
            </div>
            <div class="water-btns" id="water-btns">
              ${this.waterUnit === 'oz'
                ? `<button class="water-add-btn" data-amount="8">+ 8 oz</button>
                   <button class="water-add-btn" data-amount="12">+ 12 oz</button>
                   <button class="water-add-btn" data-amount="16">+ 16 oz</button>
                   <button class="water-add-btn" data-amount="24">+ 24 oz</button>`
                : `<button class="water-add-btn" data-amount="250">+ 250 ml</button>
                   <button class="water-add-btn" data-amount="500">+ 500 ml</button>
                   <button class="water-add-btn" data-amount="750">+ 750 ml</button>`
              }
            </div>
          </div>
        </div>

        <!-- Meal Sections -->
        <div style="padding:8px 16px 0;" id="meal-sections">
          ${MEAL_SLOTS.map(slot => this.renderMealSection(slot, entries)).join('')}
        </div>
      </div>

      <!-- Food Log Modal -->
      <div class="modal-overlay" id="food-modal">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <div class="modal-title" id="modal-title">Add Food</div>
            <button class="modal-close" id="modal-close">✕</button>
          </div>
          <div class="modal-body" id="modal-body"></div>
        </div>
      </div>
    `;

    this.bindEvents(container);
  },

  renderMacroBar(label, key, value, target) {
    const pct = target ? Math.min((value / target) * 100, 100) : 0;
    const displayVal = target
      ? `${Math.round(value)}g / ${target}g`
      : `${Math.round(value)}g`;

    return `
      <div class="macro-bar-row">
        <div class="macro-bar-label">${label}</div>
        <div class="macro-bar-track">
          <div class="macro-bar-fill ${key}" style="width:${pct}%"></div>
        </div>
        <div class="macro-bar-value">${displayVal}</div>
      </div>
    `;
  },

  renderMealSection(slot, allEntries) {
    const entries = allEntries.filter(e => e.meal_slot === slot.value);
    const slotCalories = Math.round(sumNutrition(entries).calories);

    return `
      <div class="card meal-section fade-up">
        <div class="meal-section-header">
          <div class="meal-section-title">
            <span class="meal-icon">${slot.icon}</span>
            <span class="meal-name">${slot.label}</span>
            ${slotCalories > 0 ? `<span class="meal-calories">${slotCalories} kcal</span>` : ''}
          </div>
          <button class="meal-add-btn" data-slot="${slot.value}" aria-label="Add food to ${slot.label}">+</button>
        </div>
        ${entries.length === 0
          ? `<div style="padding:4px 16px 14px;font-size:0.82rem;color:var(--text-light);">Nothing logged yet</div>`
          : entries.map(e => this.renderFoodEntry(e)).join('')
        }
      </div>
    `;
  },

  renderFoodEntry(entry) {
    return `
      <div class="food-entry" data-id="${entry.id}">
        <div class="food-entry-info">
          <div class="food-entry-name">${entry.food_name}</div>
          <div class="food-entry-detail">${entry.serving_qty} ${entry.serving_unit}</div>
        </div>
        <div class="food-entry-cals">${Math.round(entry.nutrition?.calories || 0)} kcal</div>
        <button class="btn btn-ghost btn-sm" style="padding:4px 8px;color:var(--text-muted);" data-delete="${entry.id}">✕</button>
      </div>
    `;
  },

  bindEvents(container) {
    // Water logging
    container.querySelectorAll('[data-amount]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const amount = parseFloat(btn.dataset.amount);
        await WaterLog.add({
          date: this.date,
          amount,
          unit: this.waterUnit
        });
        showToast(`Added ${amount}${this.waterUnit} of water`, 'success');
        await this.render(container);
      });
    });

    // Add food buttons
    container.querySelectorAll('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openFoodModal(btn.dataset.slot, container);
      });
    });

    // Delete food entry
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.delete);
        await FoodLog.delete(id);
        showToast('Entry removed', 'info');
        await this.render(container);
      });
    });

    // Modal close
    document.getElementById('modal-close').addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('food-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('food-modal')) this.closeModal();
    });
  },

  // ─── Food Modal ─────────────────────────────────────────────────────────────

  openFoodModal(slot, container) {
    const slotInfo = MEAL_SLOTS.find(s => s.value === slot);
    document.getElementById('modal-title').textContent = `Add to ${slotInfo?.label || slot}`;
    this.renderModalSearch(slot, container);
    document.getElementById('food-modal').classList.add('open');
  },

  closeModal() {
    document.getElementById('food-modal').classList.remove('open');
  },

  renderModalSearch(slot, pageContainer) {
    const body = document.getElementById('modal-body');
    body.innerHTML = `
      <div class="search-bar form-group">
        <span class="search-icon">🔍</span>
        <input
          class="form-input"
          type="text"
          id="food-search-input"
          placeholder="Search foods or ingredients..."
          autocomplete="off"
        />
      </div>
      <div id="search-results"></div>
      <div style="margin-top:16px;border-top:1px solid var(--border-soft);padding-top:16px;">
        <button class="btn btn-secondary btn-full" id="btn-custom-food">
          + Add custom food
        </button>
      </div>
    `;

    const searchInput = document.getElementById('food-search-input');
    const resultsDiv = document.getElementById('search-results');

    searchInput.focus();

    searchInput.addEventListener('input', () => {
      clearTimeout(this.searchTimeout);
      const q = searchInput.value.trim();

      if (q.length < 2) {
        resultsDiv.innerHTML = '';
        return;
      }

      resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div></div>';

      this.searchTimeout = setTimeout(async () => {
        try {
          const foods = await searchFoods(q);
          this.renderSearchResults(foods, slot, pageContainer, resultsDiv);
        } catch (err) {
          resultsDiv.innerHTML = `<div class="form-error" style="text-align:center;padding:12px;">${err.message}</div>`;
        }
      }, 400);
    });

    document.getElementById('btn-custom-food').addEventListener('click', () => {
      this.renderCustomFoodForm(slot, pageContainer);
    });
  },

  renderSearchResults(foods, slot, pageContainer, resultsDiv) {
    if (!foods.length) {
      resultsDiv.innerHTML = `
        <div class="empty-state" style="padding:24px;">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">No results found</div>
          <div class="empty-sub">Try a different search term or add a custom food.</div>
        </div>
      `;
      return;
    }

    resultsDiv.innerHTML = `
      <div class="food-result-list">
        ${foods.slice(0, 15).map(food => `
          <div class="food-result-item" data-food-id="${food.id}">
            <span class="food-result-badge ${food.source === 'usda' ? 'badge-usda' : 'badge-custom'}">
              ${food.source === 'usda' ? 'USDA' : 'Custom'}
            </span>
            <div style="flex:1;min-width:0;">
              <div class="food-result-name">${food.name}</div>
              ${food.brand ? `<div class="food-result-brand">${food.brand}</div>` : ''}
            </div>
            <div class="food-result-cal">
              ${food.nutrition?.calories !== null ? food.nutrition.calories + ' kcal' : '--'}
              <div style="font-size:0.68rem;color:var(--text-light);">per ${food.serving_size}${food.serving_unit}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    resultsDiv.querySelectorAll('.food-result-item').forEach(item => {
      item.addEventListener('click', async () => {
        const food = foods.find(f => f.id === item.dataset.foodId);
        if (!food) return;

        if (food.source === 'usda' && food.fdc_id) {
          try {
            item.style.opacity = '0.6';
            const detailedFood = await getFoodDetail(food.fdc_id);
            this.renderPortionSelector(detailedFood, slot, pageContainer);
          } catch (err) {
            showToast('Could not load serving details', 'error');
            item.style.opacity = '';
          }
          return;
        }

        this.renderPortionSelector(food, slot, pageContainer);
      });
    });
  },

  renderPortionSelector(food, slot, pageContainer) {
    const body = document.getElementById('modal-body');
    const isSnack = slot === 'snack';

    body.innerHTML = `
      <div style="margin-bottom:20px;">
        <button class="btn btn-ghost btn-sm" id="btn-back-search" style="margin-bottom:12px;padding-left:0;">← Back</button>
        <div style="font-size:1rem;font-weight:600;color:var(--text-dark);margin-bottom:4px;">${food.name}</div>
        ${food.brand ? `<div style="font-size:0.8rem;color:var(--text-muted);">${food.brand}</div>` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">Serving size</label>
        <div style="display:flex;gap:10px;">
          <input
            class="form-input"
            type="number"
            id="serving-qty"
            value="${food.serving_size}"
            min="0.1"
            step="0.1"
            style="width:100px;flex-shrink:0;"
          />
          <select class="form-select" id="serving-unit">
            <option value="${food.serving_unit}">${food.serving_unit}</option>
            ${food.portions ? food.portions.map(p => `<option value="${p.unit}">${p.unit}</option>`).join('') : ''}
            <option value="g">g</option>
            <option value="oz">oz</option>
          </select>
        </div>
      </div>

      <!-- Nutrition preview -->
      <div class="card" style="margin-bottom:20px;background:var(--cream-50);">
        <div class="card-padded" id="nutrition-preview">
          ${this.renderNutritionPreview(food.nutrition, 1)}
        </div>
      </div>

      ${isSnack ? this.renderSnackFields() : ''}

      <div id="add-food-error" class="form-error" style="display:none;margin-bottom:12px;"></div>
      <button class="btn btn-primary btn-full btn-lg" id="btn-log-food">
        Log this food
      </button>
    `;

    // Update nutrition preview on serving change
    const qtyInput = document.getElementById('serving-qty');
    const unitInput = document.getElementById('serving-unit');
    const updatePreview = () => {
      const scaled = this.scaleFoodNutrition(food, qtyInput.value, unitInput.value);
      document.getElementById('nutrition-preview').innerHTML = this.renderNutritionPreview(scaled, 1);
    };
    qtyInput.addEventListener('input', updatePreview);
    unitInput.addEventListener('change', updatePreview);

    document.getElementById('btn-back-search').addEventListener('click', () => {
      this.renderModalSearch(slot, pageContainer);
    });

    document.getElementById('btn-log-food').addEventListener('click', async () => {
      await this.logFood(food, slot, pageContainer);
    });
  },

  renderNutritionPreview(nutrition, factor = 1) {
    const n = nutrition || {};
    const cals = n.calories !== null ? Math.round((n.calories || 0) * factor) : null;

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="grid-column:1/-1;text-align:center;margin-bottom:4px;">
          <span style="font-family:var(--font-display);font-size:1.6rem;font-weight:700;color:var(--green-800);">
            ${cals !== null ? cals : '--'}
          </span>
          <span style="font-size:0.8rem;color:var(--text-muted);"> kcal</span>
        </div>
        ${[
          ['Protein', n.protein, 'g'],
          ['Carbs', n.carbs, 'g'],
          ['Fat', n.fat, 'g'],
          ['Fiber', n.fiber, 'g'],
          ['Sugar', n.sugar, 'g'],
          ['Sodium', n.sodium, 'mg']
        ].map(([label, val, unit]) => `
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;padding:3px 0;border-bottom:1px solid var(--border-soft);">
            <span style="color:var(--text-muted);">${label}</span>
            <span style="font-weight:500;">${val !== null && val !== undefined ? val + unit : '--'}</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  renderSnackFields() {
    const motivationOptions = SNACK_MOTIVATIONS.map(m =>
      `<option value="${m.value}">${m.label}</option>`
    ).join('');

    return `
      <div style="border-top:1px solid var(--border-soft);padding-top:16px;margin-bottom:16px;">
        <div style="font-size:0.78rem;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">
          Snack Details
        </div>

        <div class="form-group">
          <label class="form-label">Nearest meal</label>
          <div style="display:flex;gap:10px;">
            <select class="form-select" id="snack-meal" style="flex:1;">
              <option value="">Select meal</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
            <select class="form-select" id="snack-timing" style="width:110px;flex-shrink:0;">
              <option value="">Before/After</option>
              <option value="before">Before</option>
              <option value="after">After</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Why did you feel you needed or wanted this snack? <span class="required">*</span></label>
          <select class="form-select" id="snack-motivation" required>
            <option value="">Select a reason</option>
            ${motivationOptions}
          </select>
        </div>
      </div>
    `;
  },

  async logFood(food, slot, pageContainer) {
    const qty = parseFloat(document.getElementById('serving-qty').value);
    const unit = document.getElementById('serving-unit').value;
    const errorEl = document.getElementById('add-food-error');

    if (!qty || qty <= 0) {
      errorEl.textContent = 'Please enter a valid serving size.';
      errorEl.style.display = 'block';
      return;
    }

    const nutrition = this.scaleFoodNutrition(food, qty, unit);

    const entry = {
      date: this.date,
      meal_slot: slot,
      food_id: food.id,
      food_name: food.name,
      serving_qty: qty,
      serving_unit: unit,
      nutrition,
      snack_relative_meal: null,
      snack_timing: null,
      snack_motivation: null
    };

    // Snack-specific validation
    if (slot === 'snack') {
      const motivation = document.getElementById('snack-motivation')?.value;
      if (!motivation) {
        errorEl.textContent = 'Please select a motivation for this snack.';
        errorEl.style.display = 'block';
        return;
      }
      entry.snack_relative_meal = document.getElementById('snack-meal')?.value || null;
      entry.snack_timing = document.getElementById('snack-timing')?.value || null;
      entry.snack_motivation = motivation;
    }

    try {
      await FoodLog.add(entry);
      this.closeModal();
      showToast(`${food.name} logged!`, 'success');
      await this.render(pageContainer);
    } catch (err) {
      errorEl.textContent = 'Failed to log food. Please try again.';
      errorEl.style.display = 'block';
      console.error('Log error:', err);
    }
  },

  renderCustomFoodForm(slot, pageContainer) {
    // Dynamically import to keep initial bundle lighter
    import('./food.js').then(({ createCustomFood }) => {
      const body = document.getElementById('modal-body');
      body.innerHTML = `
        <button class="btn btn-ghost btn-sm" id="btn-back-search2" style="margin-bottom:16px;padding-left:0;">← Back</button>
        <div class="onboard-step-title" style="font-size:1.2rem;margin-bottom:4px;">Custom Food</div>
        <div class="onboard-step-sub" style="margin-bottom:20px;font-size:0.82rem;">
          Only calories are required. All other fields are optional.
        </div>

        <div class="form-group">
          <label class="form-label">Food name <span class="required">*</span></label>
          <input class="form-input" type="text" id="cf-name" placeholder="e.g., Mom's chili" />
        </div>
        <div class="form-group">
          <label class="form-label">Brand (optional)</label>
          <input class="form-input" type="text" id="cf-brand" placeholder="Brand name" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Serving size</label>
            <input class="form-input" type="number" id="cf-serving-size" value="1" min="0.1" />
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input class="form-input" type="text" id="cf-serving-unit" value="serving" />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">Calories <span class="required">*</span></label>
            <input class="form-input" type="number" id="cf-calories" placeholder="kcal" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Protein (g)</label>
            <input class="form-input" type="number" id="cf-protein" placeholder="optional" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Carbs (g)</label>
            <input class="form-input" type="number" id="cf-carbs" placeholder="optional" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Fat (g)</label>
            <input class="form-input" type="number" id="cf-fat" placeholder="optional" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Fiber (g)</label>
            <input class="form-input" type="number" id="cf-fiber" placeholder="optional" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Sugar (g)</label>
            <input class="form-input" type="number" id="cf-sugar" placeholder="optional" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Sodium (mg)</label>
            <input class="form-input" type="number" id="cf-sodium" placeholder="optional" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Sat. Fat (g)</label>
            <input class="form-input" type="number" id="cf-satfat" placeholder="optional" min="0" />
          </div>
        </div>

        <div id="cf-error" class="form-error" style="display:none;margin-bottom:12px;"></div>
        <button class="btn btn-primary btn-full" id="btn-save-custom">Save & log food</button>
      `;

      document.getElementById('btn-back-search2').addEventListener('click', () => {
        this.renderModalSearch(slot, pageContainer);
      });

      document.getElementById('btn-save-custom').addEventListener('click', async () => {
        const name = document.getElementById('cf-name').value.trim();
        const calories = parseFloat(document.getElementById('cf-calories').value);
        const errorEl = document.getElementById('cf-error');

        if (!name) {
          errorEl.textContent = 'Food name is required.';
          errorEl.style.display = 'block';
          return;
        }

        if (!calories && calories !== 0) {
          errorEl.textContent = 'Calories are required.';
          errorEl.style.display = 'block';
          return;
        }

        const val = (id) => {
          const v = parseFloat(document.getElementById(id).value);
          return isNaN(v) ? null : v;
        };

        try {
          const food = await createCustomFood({
            name,
            brand: document.getElementById('cf-brand').value || null,
            serving_size: parseFloat(document.getElementById('cf-serving-size').value) || 1,
            serving_unit: document.getElementById('cf-serving-unit').value || 'serving',
            calories,
            protein:       val('cf-protein'),
            carbs:         val('cf-carbs'),
            fat:           val('cf-fat'),
            fiber:         val('cf-fiber'),
            sugar:         val('cf-sugar'),
            sodium:        val('cf-sodium'),
            saturated_fat: val('cf-satfat')
          });

          this.renderPortionSelector(food, slot, pageContainer);
        } catch (err) {
          errorEl.textContent = 'Failed to save food.';
          errorEl.style.display = 'block';
        }
      });
    });
  }
};

export { LogScreen };
