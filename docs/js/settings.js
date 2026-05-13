// settings.js - App settings and targets

import { Profile, Targets } from './db.js';
import { showToast } from './app.js';

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

          <!-- Local Data -->
          <div class="settings-section-title">Local Data</div>
          <div class="settings-row" id="btn-manage-cloud">
            <div class="settings-row-left">
              <div class="settings-row-icon">💾</div>
              <div>
                <div class="settings-row-label">Storage</div>
                <div class="settings-row-sub">Stored locally on this device</div>
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
                <div class="settings-row-sub">Version 1.0.0 · GPL-3.0</div>
              </div>
            </div>
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

    document.getElementById('btn-manage-cloud').addEventListener('click', () => {
      this.renderManageCloud(container);
    });

    document.getElementById('btn-privacy').addEventListener('click', () => {
      this.openModal('Privacy');
      document.getElementById('settings-modal-body').innerHTML = `
        <p style="font-size:0.92rem;line-height:1.7;color:var(--text-mid);">
          BiteWise stores all your data locally on your device using IndexedDB.
          No data is transmitted to any server run by this application.
        </p>
        <p style="font-size:0.92rem;line-height:1.7;color:var(--text-mid);margin-top:12px;">
          Cloud backup and restore are temporarily disabled while the OAuth flow is
          being reworked. Until then, your profile, logs, foods, recipes, and targets
          remain local to this browser profile.
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

  renderEditProfile(profile, container) {
    this.openModal('Edit Profile');
    const body = document.getElementById('settings-modal-body');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Full name <span class="required">*</span></label>
        <input class="form-input" type="text" id="ep-name" value="${profile?.name || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Date of birth</label>
        <input class="form-input" type="date" id="ep-dob" value="${profile?.dob || ''}" />
      </div>
      <div class="form-group">
        <label class="form-label">Email address</label>
        <input class="form-input" type="email" id="ep-email" value="${profile?.email || ''}" />
      </div>
      <div id="ep-error" class="form-error" style="display:none;margin-bottom:12px;"></div>
      <button class="btn btn-primary btn-full" id="btn-save-profile">Save changes</button>
    `;

    document.getElementById('btn-save-profile').addEventListener('click', async () => {
      const name = document.getElementById('ep-name').value.trim();
      if (!name) {
        document.getElementById('ep-error').textContent = 'Name is required.';
        document.getElementById('ep-error').style.display = 'block';
        return;
      }

      try {
        await Profile.save({
          ...profile,
          name,
          dob:   document.getElementById('ep-dob').value,
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

  renderManageCloud(container) {
    this.openModal('Local Storage');
    const body = document.getElementById('settings-modal-body');

    body.innerHTML = `
      <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:20px;line-height:1.5;">
        BiteWise is currently running in local-only mode. Your data is stored in
        this browser's IndexedDB database and no OAuth sign-in is required.
      </p>
      <p style="font-size:0.88rem;color:var(--text-muted);line-height:1.5;">
        Cloud backup and restore will return after OAuth support is fixed.
      </p>
    `;
  }
};

export { SettingsScreen };
