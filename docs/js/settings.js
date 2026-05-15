// settings.js - App settings and targets

import { Profile, Targets } from './db.js';
import {
  clearBackendFoodSourceUrl,
  clearUSDAApiKey,
  getBackendFoodSourceStatus,
  getUSDAApiKeyStatus,
  saveBackendFoodSourceUrl,
  saveUSDAApiKey,
  validateBackendFoodSourceUrl,
  validateUSDAApiKey
} from './food.js';
import { showToast } from './app.js';
import { APP_VERSION } from './version.js';
import { Auth } from './auth.js';
import { Sync } from './sync.js';

const monthOptions = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
].map((month, index) => `<option value="${String(index + 1).padStart(2, '0')}">${month}</option>`).join('');

function getDateParts(dob) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  return match ? { year: match[1], month: match[2], day: String(Number(match[3])) } : { year: '', month: '', day: '' };
}

function getDateOfBirthValue(prefix, required = false) {
  const month = document.getElementById(`${prefix}-month`).value;
  const dayRaw = document.getElementById(`${prefix}-day`).value;
  const year = document.getElementById(`${prefix}-year`).value;

  if (!month && !dayRaw && !year && !required) return '';
  if (!month || !dayRaw || !year) return null;

  const day = dayRaw.padStart(2, '0');
  const dob = `${year}-${month}-${day}`;
  const parsed = new Date(`${dob}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return dob;
}

const SettingsScreen = {

  async render(container) {
    const [profile, targets] = await Promise.all([
      Profile.get(),
      Targets.getActive()
    ]);

    container.innerHTML = `
      <div class="page-header">
        <h1>Settings</h1>
      </div>

      <div class="page-content">
        <div class="settings-list">

          <!-- Profile -->
          <div class="settings-section-title">Profile</div>
          <div class="card card-padded" style="margin-bottom:8px;">
            <div style="font-size:1.05rem;font-weight:600;color:var(--text-dark);">${profile?.name || 'Unknown'}</div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px;">${profile?.email || ''}</div>
            <div style="font-size:0.78rem;color:var(--text-light);margin-top:2px;">
              Born ${profile?.dob ? new Date(profile.dob + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '--'}
            </div>
          </div>
          <div class="settings-row" id="btn-edit-profile">
            <div class="settings-row-left">
              <div class="settings-row-icon">✏️</div>
              <div>
                <div class="settings-row-label">Edit profile</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>

          <!-- Targets -->
          <div class="settings-section-title">Daily Targets</div>
          <div class="settings-row" id="btn-edit-targets">
            <div class="settings-row-left">
              <div class="settings-row-icon">🎯</div>
              <div>
                <div class="settings-row-label">Nutrition targets</div>
                <div class="settings-row-sub">
                  ${targets?.calories ? `${targets.calories} kcal` : 'No targets set — start with a baseline'}
                </div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>

          <!-- Units -->
          <div class="settings-section-title">Preferences</div>
          <div class="settings-row" id="btn-edit-units">
            <div class="settings-row-left">
              <div class="settings-row-icon">💧</div>
              <div>
                <div class="settings-row-label">Water units</div>
                <div class="settings-row-sub">${profile?.water_unit === 'ml' ? 'Milliliters (ml)' : 'Fluid ounces (oz)'}</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>
          <div class="settings-row" id="btn-usda-api-key">
            <div class="settings-row-left">
              <div class="settings-row-icon">🔑</div>
              <div>
                <div class="settings-row-label">USDA API key</div>
                <div class="settings-row-sub">Use your own FoodData Central key</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>
          <div class="settings-row" id="btn-backend-food-source">
            <div class="settings-row-left">
              <div class="settings-row-icon">🍔</div>
              <div>
                <div class="settings-row-label">Backend food tables</div>
                <div class="settings-row-sub">Search restaurant and home menu data</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>

          <!-- Local Data -->
          <div class="settings-section-title">Local Data</div>
          <div class="settings-row" id="btn-manage-cloud">
            <div class="settings-row-left">
              <div class="settings-row-icon">💾</div>
              <div>
                <div class="settings-row-label">Backup & restore</div>
                <div class="settings-row-sub">Save data to Google Drive or OneDrive</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>

          <!-- About -->
          <div class="settings-section-title">About</div>
          <div class="settings-row">
            <div class="settings-row-left">
              <div class="settings-row-icon">🌿</div>
              <div>
                <div class="settings-row-label">BiteWise</div>
                <div class="settings-row-sub">Version ${APP_VERSION} · GPL-3.0</div>
              </div>
            </div>
          </div>
          <div class="settings-row" id="btn-whats-new">
            <div class="settings-row-left">
              <div class="settings-row-icon">✨</div>
              <div>
                <div class="settings-row-label">What's New?</div>
                <div class="settings-row-sub">Recent improvements and fixes</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>
          <div class="settings-row" id="btn-privacy">
            <div class="settings-row-left">
              <div class="settings-row-icon">🔒</div>
              <div>
                <div class="settings-row-label">Privacy</div>
                <div class="settings-row-sub">Your data never leaves your device</div>
              </div>
            </div>
            <div class="settings-row-arrow">›</div>
          </div>

        </div>
      </div>

      <!-- Settings modals rendered inline -->
      <div class="modal-overlay" id="settings-modal">
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-header">
            <div class="modal-title" id="settings-modal-title">Settings</div>
            <button class="modal-close" id="settings-modal-close">✕</button>
          </div>
          <div class="modal-body" id="settings-modal-body"></div>
        </div>
      </div>
    `;

    this.bindEvents(container, profile, targets);
  },

  bindEvents(container, profile, targets) {
    const modal = document.getElementById('settings-modal');
    const modalClose = document.getElementById('settings-modal-close');
    const closeModal = () => modal.classList.remove('open');

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById('btn-edit-profile').addEventListener('click', () => {
      this.renderEditProfile(profile, container);
    });

    document.getElementById('btn-edit-targets').addEventListener('click', () => {
      this.renderEditTargets(targets, container);
    });

    document.getElementById('btn-edit-units').addEventListener('click', () => {
      this.renderEditUnits(profile, container);
    });

    document.getElementById('btn-usda-api-key').addEventListener('click', () => {
      this.renderUSDAApiKey(container);
    });

    document.getElementById('btn-backend-food-source').addEventListener('click', () => {
      this.renderBackendFoodSource(container);
    });

    document.getElementById('btn-manage-cloud').addEventListener('click', () => {
      this.renderManageCloud(container);
    });

    document.getElementById('btn-whats-new').addEventListener('click', () => {
      this.renderWhatsNew();
    });

    document.getElementById('btn-privacy').addEventListener('click', () => {
      this.openModal('Privacy');
      document.getElementById('settings-modal-body').innerHTML = `
        <p style="font-size:0.92rem;line-height:1.7;color:var(--text-mid);">
          BiteWise stores all your data locally on your device using IndexedDB.
          No data is transmitted to any server run by this application.
        </p>
        <p style="font-size:0.92rem;line-height:1.7;color:var(--text-mid);margin-top:12px;">
          Backup and restore can write a single BiteWise JSON file to your chosen
          Google Drive or OneDrive app storage after you connect that provider.
        </p>
        <p style="font-size:0.92rem;line-height:1.7;color:var(--text-mid);margin-top:12px;">
          This application is open source (GPL-3.0) and hosted on GitHub Pages.
          Source code is available at github.com/BreathHolder/BiteWise.
        </p>
      `;
    });
  },

  openModal(title) {
    document.getElementById('settings-modal-title').textContent = title;
    document.getElementById('settings-modal').classList.add('open');
  },

  renderWhatsNew() {
    this.openModal("What's New?");
    document.getElementById('settings-modal-body').innerHTML = `
      <div class="whats-new-list">
        <div class="whats-new-item">
          <div class="whats-new-title">Saved foods</div>
          <div class="whats-new-copy">
            Star foods from search results or serving details to save them locally and reduce repeat USDA lookups.
          </div>
        </div>
        <div class="whats-new-item">
          <div class="whats-new-title">More accurate packaged-food servings</div>
          <div class="whats-new-copy">
            USDA branded food data is normalized from per-100g values to the label serving size, including household portions like cups.
          </div>
        </div>
        <div class="whats-new-item">
          <div class="whats-new-title">Improved serving unit math</div>
          <div class="whats-new-copy">
            Ounces, fluid ounces, grams, and known portions now update calorie and macro previews before logging.
          </div>
        </div>
        <div class="whats-new-item">
          <div class="whats-new-title">Birthday entry cleanup</div>
          <div class="whats-new-copy">
            Date of birth now uses separate month, day, and year fields in onboarding and profile settings.
          </div>
        </div>
        <div class="whats-new-item">
          <div class="whats-new-title">Better local cache handling</div>
          <div class="whats-new-copy">
            Older cached USDA foods are migrated to the current nutrition format when they appear in search or saved foods.
          </div>
        </div>
      </div>
    `;
  },

  renderEditProfile(profile, container) {
    this.openModal('Edit Profile');
    const body = document.getElementById('settings-modal-body');
    const dobParts = getDateParts(profile?.dob);
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Full name <span class="required">*</span></label>
        <input class="form-input" type="text" id="ep-name" value="${profile?.name || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ep-dob-month">Date of birth</label>
        <div class="date-fields">
          <select class="form-select" id="ep-dob-month" aria-label="Birth month">
            <option value="">Month</option>
            ${monthOptions}
          </select>
          <input
            class="form-input"
            type="number"
            id="ep-dob-day"
            min="1"
            max="31"
            placeholder="Day"
            aria-label="Birth day"
            inputmode="numeric"
            value="${dobParts.day}"
          />
          <input
            class="form-input"
            type="number"
            id="ep-dob-year"
            min="1900"
            max="${new Date().getFullYear()}"
            placeholder="Year"
            aria-label="Birth year"
            inputmode="numeric"
            value="${dobParts.year}"
          />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email address</label>
        <input class="form-input" type="email" id="ep-email" value="${profile?.email || ''}" />
      </div>
      <div id="ep-error" class="form-error" style="display:none;margin-bottom:12px;"></div>
      <button class="btn btn-primary btn-full" id="btn-save-profile">Save changes</button>
    `;
    document.getElementById('ep-dob-month').value = dobParts.month;

    document.getElementById('btn-save-profile').addEventListener('click', async () => {
      const name = document.getElementById('ep-name').value.trim();
      const dob = getDateOfBirthValue('ep-dob');
      if (!name) {
        document.getElementById('ep-error').textContent = 'Name is required.';
        document.getElementById('ep-error').style.display = 'block';
        return;
      }
      if (dob === null) {
        document.getElementById('ep-error').textContent = 'Please enter a valid date of birth.';
        document.getElementById('ep-error').style.display = 'block';
        return;
      }

      try {
        await Profile.save({
          ...profile,
          name,
          dob,
          email: document.getElementById('ep-email').value.trim()
        });
        showToast('Profile updated', 'success');
        document.getElementById('settings-modal').classList.remove('open');
        await this.render(container);
      } catch (err) {
        document.getElementById('ep-error').textContent = 'Save failed.';
        document.getElementById('ep-error').style.display = 'block';
      }
    });
  },

  renderEditTargets(targets, container) {
    this.openModal('Daily Targets');
    const body = document.getElementById('settings-modal-body');

    body.innerHTML = `
      <div style="background:var(--cream-100);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:20px;font-size:0.82rem;color:var(--text-mid);line-height:1.5;">
        <strong>Tip:</strong> Before setting targets, consider tracking for 3–7 days first
        to establish a personal baseline. Targets work best when they reflect your actual habits.
      </div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">All targets are optional. Leave blank to skip.</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label class="form-label">Calories (kcal)</label>
          <input class="form-input" type="number" id="t-calories" value="${targets?.calories || ''}" placeholder="e.g. 2000" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Protein (g)</label>
          <input class="form-input" type="number" id="t-protein" value="${targets?.protein || ''}" placeholder="optional" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Carbs (g)</label>
          <input class="form-input" type="number" id="t-carbs" value="${targets?.carbs || ''}" placeholder="optional" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Fat (g)</label>
          <input class="form-input" type="number" id="t-fat" value="${targets?.fat || ''}" placeholder="optional" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Water (${targets?.water_unit || 'oz'})</label>
          <input class="form-input" type="number" id="t-water" value="${targets?.water || ''}" placeholder="optional" min="0" />
        </div>
      </div>

      <button class="btn btn-primary btn-full" id="btn-save-targets" style="margin-top:8px;">Save targets</button>
      ${targets ? `<button class="btn btn-ghost btn-full" id="btn-clear-targets" style="margin-top:8px;color:var(--orange-500);">Clear all targets</button>` : ''}
    `;

    const val = (id) => {
      const v = parseFloat(document.getElementById(id).value);
      return isNaN(v) ? null : v;
    };

    document.getElementById('btn-save-targets').addEventListener('click', async () => {
      try {
        await Targets.save({
          calories:   val('t-calories'),
          protein:    val('t-protein'),
          carbs:      val('t-carbs'),
          fat:        val('t-fat'),
          water:      val('t-water'),
          water_unit: targets?.water_unit || 'oz'
        });
        showToast('Targets saved', 'success');
        document.getElementById('settings-modal').classList.remove('open');
        await this.render(container);
      } catch (err) {
        showToast('Save failed', 'error');
      }
    });

    if (targets) {
      document.getElementById('btn-clear-targets')?.addEventListener('click', async () => {
        await Targets.save({ calories: null, protein: null, carbs: null, fat: null, water: null });
        showToast('Targets cleared', 'info');
        document.getElementById('settings-modal').classList.remove('open');
        await this.render(container);
      });
    }
  },

  renderEditUnits(profile, container) {
    this.openModal('Water Units');
    const body = document.getElementById('settings-modal-body');

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Water tracking unit</label>
        <select class="form-select" id="unit-select">
          <option value="oz" ${profile?.water_unit === 'oz' ? 'selected' : ''}>Fluid ounces (oz)</option>
          <option value="ml" ${profile?.water_unit === 'ml' ? 'selected' : ''}>Milliliters (ml)</option>
        </select>
      </div>
      <button class="btn btn-primary btn-full" id="btn-save-units">Save</button>
    `;

    document.getElementById('btn-save-units').addEventListener('click', async () => {
      const unit = document.getElementById('unit-select').value;
      await Profile.save({ ...profile, water_unit: unit });
      showToast('Units updated', 'success');
      document.getElementById('settings-modal').classList.remove('open');
      await this.render(container);
    });
  },

  async renderUSDAApiKey(container) {
    this.openModal('USDA API Key');
    const body = document.getElementById('settings-modal-body');
    const status = await getUSDAApiKeyStatus();

    body.innerHTML = `
      <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:16px;line-height:1.5;">
        BiteWise uses USDA FoodData Central for food search. Enter your own free
        data.gov API key to avoid the stricter DEMO_KEY rate limit.
      </p>
      <div class="form-group">
        <label class="form-label" for="usda-api-key-input">API key</label>
        <input
          class="form-input"
          type="password"
          id="usda-api-key-input"
          placeholder="${status.hasCustomKey ? status.keyPreview : 'Paste your USDA API key'}"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <div class="form-hint">
          ${status.hasCustomKey ? `Custom key saved: ${status.keyPreview}` : 'Stored only in this browser. The public app code cannot hide embedded keys.'}
        </div>
      </div>
      <button class="btn btn-primary btn-full" id="btn-save-usda-key">Save key</button>
      ${status.hasCustomKey ? `<button class="btn btn-ghost btn-full" id="btn-clear-usda-key" style="margin-top:8px;color:var(--orange-500);">Use DEMO_KEY instead</button>` : ''}
      <p style="font-size:0.78rem;color:var(--text-light);margin-top:14px;line-height:1.5;">
        Need a key? Get a free USDA API key at
        <a href="https://fdc.nal.usda.gov/api-key-signup/" target="_blank" rel="noopener noreferrer" style="color:var(--green-700);font-weight:600;">
          fdc.nal.usda.gov/api-key-signup/
        </a>
      </p>
    `;

    document.getElementById('btn-save-usda-key').addEventListener('click', async () => {
      const value = document.getElementById('usda-api-key-input').value.trim();
      const button = document.getElementById('btn-save-usda-key');
      if (!value) {
        showToast('Paste an API key first', 'error');
        return;
      }
      button.disabled = true;
      button.textContent = 'Validating...';
      try {
        const valid = await validateUSDAApiKey(value);
        if (!valid) {
          showToast('USDA API key was rejected', 'error');
          button.disabled = false;
          button.textContent = 'Save key';
          return;
        }
        await saveUSDAApiKey(value);
        showToast('USDA API key saved', 'success');
        document.getElementById('settings-modal').classList.remove('open');
        await this.render(container);
      } catch (err) {
        showToast('Could not validate API key', 'error');
        button.disabled = false;
        button.textContent = 'Save key';
      }
    });

    document.getElementById('btn-clear-usda-key')?.addEventListener('click', async () => {
      await clearUSDAApiKey();
      showToast('Using DEMO_KEY', 'info');
      document.getElementById('settings-modal').classList.remove('open');
      await this.render(container);
    });
  },

  async renderBackendFoodSource(container) {
    this.openModal('Backend Food Tables');
    const body = document.getElementById('settings-modal-body');
    const status = await getBackendFoodSourceStatus();

    body.innerHTML = `
      <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:16px;line-height:1.5;">
        Add a search endpoint for your own menu tables. The Log search will call it with
        <code>q</code>, <code>page</code>, and <code>pageSize</code> query parameters and
        merge the returned foods with saved foods and USDA results.
      </p>
      <div class="form-group">
        <label class="form-label" for="backend-food-url-input">Search endpoint URL</label>
        <input
          class="form-input"
          type="url"
          id="backend-food-url-input"
          value="${status.url}"
          placeholder="https://example.com/api/foods/search"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
        <div class="form-hint">
          Return an array, or an object with <code>foods</code>, <code>results</code>, or <code>items</code>.
        </div>
      </div>
      <button class="btn btn-primary btn-full" id="btn-save-backend-food-source">Save endpoint</button>
      ${status.enabled ? `<button class="btn btn-ghost btn-full" id="btn-clear-backend-food-source" style="margin-top:8px;color:var(--orange-500);">Disable backend search</button>` : ''}
    `;

    document.getElementById('btn-save-backend-food-source').addEventListener('click', async () => {
      const value = document.getElementById('backend-food-url-input').value.trim();
      const button = document.getElementById('btn-save-backend-food-source');
      if (!value) {
        showToast('Enter a backend search URL first', 'error');
        return;
      }

      button.disabled = true;
      button.textContent = 'Checking...';
      try {
        const valid = await validateBackendFoodSourceUrl(value);
        if (!valid) {
          showToast('Backend endpoint did not return searchable foods', 'error');
          button.disabled = false;
          button.textContent = 'Save endpoint';
          return;
        }

        await saveBackendFoodSourceUrl(value);
        showToast('Backend food source saved', 'success');
        document.getElementById('settings-modal').classList.remove('open');
        await this.render(container);
      } catch (err) {
        showToast(err.message || 'Could not save backend food source', 'error');
        button.disabled = false;
        button.textContent = 'Save endpoint';
      }
    });

    document.getElementById('btn-clear-backend-food-source')?.addEventListener('click', async () => {
      await clearBackendFoodSourceUrl();
      showToast('Backend food search disabled', 'info');
      document.getElementById('settings-modal').classList.remove('open');
      await this.render(container);
    });
  },

  async renderManageCloud(container) {
    this.openModal('Backup & Restore');
    const body = document.getElementById('settings-modal-body');
    const [provider, lastSync] = await Promise.all([
      Auth.getProvider(),
      Sync.getLastSyncDisplay()
    ]);
    const providerLabel = provider === 'microsoft'
      ? 'OneDrive'
      : provider === 'google'
        ? 'Google Drive'
        : 'Not connected';

    body.innerHTML = `
      <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:20px;line-height:1.5;">
        Back up your BiteWise profile, food log, water log, saved foods, recipes,
        and targets as one JSON file in your cloud drive app storage.
      </p>
      <div class="card" style="background:var(--cream-50);margin-bottom:16px;">
        <div class="card-padded">
          <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.86rem;margin-bottom:6px;">
            <span style="color:var(--text-muted);">Provider</span>
            <span style="font-weight:600;color:var(--text-dark);">${providerLabel}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.86rem;">
            <span style="color:var(--text-muted);">Last backup/restore</span>
            <span style="font-weight:600;color:var(--text-dark);text-align:right;">${lastSync}</span>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <button class="btn btn-secondary" id="btn-connect-onedrive">OneDrive</button>
        <button class="btn btn-secondary" id="btn-connect-google">Google Drive</button>
      </div>
      <button class="btn btn-primary btn-full" id="btn-cloud-backup" ${provider ? '' : 'disabled'}>
        Back up now
      </button>
      <button class="btn btn-secondary btn-full" id="btn-cloud-restore" style="margin-top:8px;" ${provider ? '' : 'disabled'}>
        Restore from cloud
      </button>
      ${provider ? `<button class="btn btn-ghost btn-full" id="btn-cloud-disconnect" style="margin-top:8px;color:var(--orange-500);">Disconnect cloud provider</button>` : ''}
      <p style="font-size:0.78rem;color:var(--text-light);margin-top:14px;line-height:1.5;">
        Restoring replaces local BiteWise data on this device. OAuth tokens are not included in backups.
      </p>
    `;

    document.getElementById('btn-connect-onedrive').addEventListener('click', async () => {
      try {
        await Auth.Microsoft.startLogin();
      } catch (err) {
        showToast(err.message, 'error', 6000);
      }
    });

    document.getElementById('btn-connect-google').addEventListener('click', async () => {
      try {
        await Auth.Google.startLogin();
      } catch (err) {
        showToast(err.message, 'error', 6000);
      }
    });

    document.getElementById('btn-cloud-backup')?.addEventListener('click', async () => {
      const button = document.getElementById('btn-cloud-backup');
      button.disabled = true;
      button.textContent = 'Backing up...';
      try {
        await Sync.backup();
        showToast('Backup saved', 'success');
        await this.renderManageCloud(container);
      } catch (err) {
        showToast(err.message || 'Backup failed', 'error', 6000);
        button.disabled = false;
        button.textContent = 'Back up now';
      }
    });

    document.getElementById('btn-cloud-restore')?.addEventListener('click', async () => {
      const ok = window.confirm('Restore will replace local BiteWise data on this device. Continue?');
      if (!ok) return;

      const button = document.getElementById('btn-cloud-restore');
      button.disabled = true;
      button.textContent = 'Restoring...';
      try {
        const result = await Sync.restore();
        showToast(result.hadData ? 'Restore complete' : 'No cloud backup found', result.hadData ? 'success' : 'info');
        document.getElementById('settings-modal').classList.remove('open');
        await this.render(container);
      } catch (err) {
        showToast(err.message || 'Restore failed', 'error', 6000);
        button.disabled = false;
        button.textContent = 'Restore from cloud';
      }
    });

    document.getElementById('btn-cloud-disconnect')?.addEventListener('click', async () => {
      await Auth.disconnectAll();
      showToast('Cloud provider disconnected', 'info');
      await this.renderManageCloud(container);
    });
  }
};

export { SettingsScreen };
