// dashboard.js - Metrics dashboard with daily/weekly/monthly trend views

import { FoodLog, WaterLog, Targets, Profile, todayString } from './db.js';
import { sumNutrition, SNACK_MOTIVATIONS } from './food.js';

// ─── Dashboard Screen ─────────────────────────────────────────────────────────

const DashboardScreen = {
  period: 'daily',
  waterUnit: 'oz',

  async render(container) {
    const profile = await Profile.get();
    this.waterUnit = profile?.water_unit || 'oz';

    const greeting = this.getGreeting(profile?.name);
    const today = new Date();
    const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    container.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <div class="date-label">${dateLabel}</div>
      </div>

      <div class="page-content">
        <div class="dashboard-greeting" style="padding-bottom:16px;">
          <div class="greeting-text fade-up">${greeting}</div>
        </div>

        <!-- Period Toggle -->
        <div style="padding:0 16px 12px;">
          <div class="period-toggle">
            <div class="period-btn ${this.period === 'daily' ? 'active' : ''}" data-period="daily">Today</div>
            <div class="period-btn ${this.period === 'weekly' ? 'active' : ''}" data-period="weekly">Week</div>
            <div class="period-btn ${this.period === 'monthly' ? 'active' : ''}" data-period="monthly">Month</div>
          </div>
        </div>

        <div id="dashboard-content" style="padding:0 16px;"></div>
      </div>
    `;

    // Period toggle
    container.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.period = btn.dataset.period;
        container.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderPeriodContent(document.getElementById('dashboard-content'));
      });
    });

    await this.renderPeriodContent(document.getElementById('dashboard-content'));
  },

  async renderPeriodContent(container) {
    container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="spinner"></div></div>';

    const { startDate, endDate, label } = this.getDateRange();
    const [entries, waterEntries, targets] = await Promise.all([
      FoodLog.getByDateRange(startDate, endDate),
      WaterLog.getByDateRange(startDate, endDate),
      Targets.getActive()
    ]);

    if (this.period === 'daily') {
      await this.renderDailyView(container, entries, waterEntries, targets);
    } else {
      await this.renderTrendView(container, entries, waterEntries, targets, startDate, endDate);
    }
  },

  async renderDailyView(container, entries, waterEntries, targets) {
    const totals = sumNutrition(entries);
    const waterTotal = waterEntries.reduce((s, e) => s + (e.unit === this.waterUnit ? e.amount : 0), 0);
    const calorieTarget = targets?.calories || null;
    const waterTarget = targets?.water || null;

    // Calorie ring progress
    const calPct = calorieTarget ? Math.min((totals.calories / calorieTarget) * 100, 100) : 0;

    // Snack motivation breakdown for today
    const snacks = entries.filter(e => e.meal_slot === 'snack' && e.snack_motivation);
    const motivationCounts = {};
    snacks.forEach(s => {
      motivationCounts[s.snack_motivation] = (motivationCounts[s.snack_motivation] || 0) + 1;
    });

    container.innerHTML = `
      <!-- Calorie Ring -->
      <div class="card" style="margin-bottom:12px;">
        <div class="stat-ring-container">
          <div class="stat-ring">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="58" fill="none" stroke="var(--cream-200)" stroke-width="12"/>
              <circle cx="70" cy="70" r="58" fill="none" stroke="var(--green-500)" stroke-width="12"
                stroke-dasharray="${2 * Math.PI * 58}"
                stroke-dashoffset="${2 * Math.PI * 58 * (1 - calPct / 100)}"
                stroke-linecap="round"
                style="transition:stroke-dashoffset 0.8s cubic-bezier(0.34,1.1,0.64,1);"
              />
            </svg>
            <div class="stat-ring-label">
              <div class="stat-ring-value">${Math.round(totals.calories)}</div>
              <div class="stat-ring-unit">${calorieTarget ? `of ${calorieTarget}` : 'kcal'}</div>
              ${calorieTarget ? `<div class="stat-ring-unit">kcal</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Macro breakdown -->
        <div class="macro-bars">
          ${this.renderMacroRow('Protein', totals.protein, targets?.protein, 'g', 'protein')}
          ${this.renderMacroRow('Carbs', totals.carbs, targets?.carbs, 'g', 'carbs')}
          ${this.renderMacroRow('Fat', totals.fat, targets?.fat, 'g', 'fat')}
          ${this.renderMacroRow('Fiber', totals.fiber, null, 'g', 'protein')}
          ${this.renderMacroRow('Sugar', totals.sugar, null, 'g', 'carbs')}
          ${this.renderMacroRow('Sodium', totals.sodium, null, 'mg', 'fat')}
        </div>
      </div>

      <!-- Water -->
      <div class="card card-padded" style="margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-family:var(--font-display);font-weight:600;color:var(--green-800);">💧 Hydration</span>
          <span style="font-size:0.82rem;color:var(--text-muted);">
            ${waterTotal}${this.waterUnit}${waterTarget ? ` / ${waterTarget}${this.waterUnit}` : ''}
          </span>
        </div>
        <div class="macro-bar-track" style="height:12px;">
          <div class="macro-bar-fill protein" style="width:${waterTarget ? Math.min((waterTotal/waterTarget)*100,100) : 0}%;background:var(--green-400);"></div>
        </div>
        ${!waterTarget ? `<div class="form-hint" style="margin-top:6px;">Set a water goal in Settings → Targets</div>` : ''}
      </div>

      <!-- Meal breakdown -->
      <div class="card card-padded" style="margin-bottom:12px;">
        <div style="font-size:0.8rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">
          By meal
        </div>
        ${this.renderMealBreakdown(entries)}
      </div>

      <!-- Snack motivations (if any snacks today) -->
      ${snacks.length > 0 ? `
        <div class="card card-padded" style="margin-bottom:12px;">
          <div style="font-size:0.8rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">
            Snack motivations
          </div>
          ${Object.entries(motivationCounts).map(([key, count]) => {
            const label = SNACK_MOTIVATIONS.find(m => m.value === key)?.label || key;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);">
                <span style="font-size:0.88rem;">${label}</span>
                <span style="font-size:0.82rem;font-weight:600;color:var(--green-700);">${count}x</span>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${entries.length === 0 ? `
        <div class="empty-state fade-up">
          <div class="empty-icon">🍽️</div>
          <div class="empty-title">Nothing logged today</div>
          <div class="empty-sub">Head to the Log tab to start tracking your meals.</div>
        </div>
      ` : ''}
    `;
  },

  async renderTrendView(container, entries, waterEntries, targets, startDate, endDate) {
    // Build per-day buckets
    const days = this.getDaysInRange(startDate, endDate);
    const byDay = {};
    days.forEach(d => { byDay[d] = []; });
    entries.forEach(e => { if (byDay[e.date]) byDay[e.date].push(e); });

    const waterByDay = {};
    days.forEach(d => { waterByDay[d] = 0; });
    waterEntries.forEach(e => {
      if (waterByDay[e.date] !== undefined && e.unit === this.waterUnit) {
        waterByDay[e.date] += e.amount;
      }
    });

    const dailyTotals = days.map(d => ({
      date: d,
      label: this.formatDayLabel(d),
      ...sumNutrition(byDay[d]),
      water: waterByDay[d] || 0
    }));

    const avgCalories = Math.round(dailyTotals.reduce((s, d) => s + d.calories, 0) / days.length);
    const avgWater = Math.round(dailyTotals.reduce((s, d) => s + d.water, 0) / days.length);
    const maxCalories = Math.max(...dailyTotals.map(d => d.calories), 1);

    // All-period snack motivation counts
    const allSnacks = entries.filter(e => e.meal_slot === 'snack' && e.snack_motivation);
    const motivationCounts = {};
    allSnacks.forEach(s => {
      motivationCounts[s.snack_motivation] = (motivationCounts[s.snack_motivation] || 0) + 1;
    });
    const topMotivations = Object.entries(motivationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    container.innerHTML = `
      <!-- Average summary -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div class="card card-padded">
          <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">
            Avg. Calories
          </div>
          <div style="font-family:var(--font-display);font-size:1.8rem;font-weight:700;color:var(--green-800);">${avgCalories}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">kcal / day</div>
        </div>
        <div class="card card-padded">
          <div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">
            Avg. Water
          </div>
          <div style="font-family:var(--font-display);font-size:1.8rem;font-weight:700;color:var(--green-800);">${avgWater}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${this.waterUnit} / day</div>
        </div>
      </div>

      <!-- Calorie trend chart -->
      <div class="card card-padded" style="margin-bottom:12px;">
        <div style="font-size:0.8rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">
          Calorie trend
        </div>
        <div style="height:120px;display:flex;align-items:flex-end;gap:${this.period === 'monthly' ? '3px' : '6px'};">
          ${dailyTotals.map(d => {
            const h = maxCalories > 0 ? Math.max((d.calories / maxCalories) * 100, 2) : 2;
            const isToday = d.date === todayString();
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;" title="${d.label}: ${Math.round(d.calories)} kcal">
                <div style="
                  width:100%;
                  height:${h}%;
                  background:${isToday ? 'var(--green-600)' : 'var(--green-300)'};
                  border-radius:4px 4px 0 0;
                  transition:height 0.5s ease;
                  min-height:3px;
                "></div>
                ${this.period !== 'monthly' ? `<div style="font-size:0.6rem;color:var(--text-muted);white-space:nowrap;">${d.label}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        ${targets?.calories ? `
          <div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);">
            Goal: ${targets.calories} kcal/day
          </div>
        ` : ''}
      </div>

      <!-- Macro averages -->
      <div class="card card-padded" style="margin-bottom:12px;">
        <div style="font-size:0.8rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">
          Average macros / day
        </div>
        <div class="macro-bars" style="padding:0;">
          ${['protein', 'carbs', 'fat'].map(macro => {
            const avg = Math.round(dailyTotals.reduce((s, d) => s + (d[macro] || 0), 0) / days.length);
            const target = targets?.[macro];
            return this.renderMacroRow(
              macro.charAt(0).toUpperCase() + macro.slice(1),
              avg, target, 'g', macro
            );
          }).join('')}
        </div>
      </div>

      <!-- Snack motivation trends -->
      ${topMotivations.length > 0 ? `
        <div class="card card-padded" style="margin-bottom:12px;">
          <div style="font-size:0.8rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">
            Top snack motivations
          </div>
          ${topMotivations.map(([key, count]) => {
            const label = SNACK_MOTIVATIONS.find(m => m.value === key)?.label || key;
            const maxCount = topMotivations[0][1];
            const pct = (count / maxCount) * 100;
            return `
              <div style="margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
                  <span>${label}</span>
                  <span style="font-weight:600;color:var(--green-700);">${count}</span>
                </div>
                <div class="macro-bar-track" style="height:6px;">
                  <div class="macro-bar-fill carbs" style="width:${pct}%;background:var(--orange-400);"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      ${entries.length === 0 ? `
        <div class="empty-state fade-up">
          <div class="empty-icon">📊</div>
          <div class="empty-title">No data yet</div>
          <div class="empty-sub">Log meals for a few days to see your trends here.</div>
        </div>
      ` : ''}
    `;
  },

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  renderMacroRow(label, value, target, unit, colorClass) {
    const pct = target ? Math.min(((value || 0) / target) * 100, 100) : 0;
    const displayVal = target
      ? `${Math.round(value || 0)}${unit} / ${target}${unit}`
      : `${Math.round(value || 0)}${unit}`;

    return `
      <div class="macro-bar-row">
        <div class="macro-bar-label">${label}</div>
        <div class="macro-bar-track">
          <div class="macro-bar-fill ${colorClass}" style="width:${target ? pct : 0}%"></div>
        </div>
        <div class="macro-bar-value">${displayVal}</div>
      </div>
    `;
  },

  renderMealBreakdown(entries) {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    const icons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };
    const names = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

    return slots.map(slot => {
      const slotEntries = entries.filter(e => e.meal_slot === slot);
      const cals = Math.round(sumNutrition(slotEntries).calories);
      if (!slotEntries.length) return '';

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-soft);">
          <span style="font-size:0.88rem;">${icons[slot]} ${names[slot]}</span>
          <span style="font-size:0.88rem;font-weight:600;color:var(--green-700);">${cals} kcal</span>
        </div>
      `;
    }).join('');
  },

  getDateRange() {
    const today = new Date();
    let startDate, endDate, label;

    const fmt = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (this.period === 'daily') {
      startDate = endDate = fmt(today);
      label = 'Today';
    } else if (this.period === 'weekly') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      startDate = fmt(start);
      endDate = fmt(today);
      label = 'Last 7 days';
    } else {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      startDate = fmt(start);
      endDate = fmt(today);
      label = 'Last 30 days';
    }

    return { startDate, endDate, label };
  },

  getDaysInRange(startDate, endDate) {
    const days = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const cur = new Date(start);

    while (cur <= end) {
      const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      days.push(d);
      cur.setDate(cur.getDate() + 1);
    }

    return days;
  },

  formatDayLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (this.period === 'weekly') {
      return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    }
    return String(d.getDate());
  },

  getGreeting(name) {
    const hour = new Date().getHours();
    const firstName = name ? name.split(' ')[0] : '';
    let prefix;

    if (hour < 12)      prefix = 'Good morning';
    else if (hour < 17) prefix = 'Good afternoon';
    else                prefix = 'Good evening';

    return firstName ? `${prefix}, ${firstName}` : prefix;
  }
};

export { DashboardScreen };
