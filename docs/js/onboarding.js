// onboarding.js - First-run setup flow
// Steps: welcome -> profile -> targets -> complete

import { Profile, Targets } from './db.js';
import { Auth } from './auth.js';
import { Sync } from './sync.js';

const monthOptions = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
].map((month, index) => `<option value="${String(index + 1).padStart(2, '0')}">${month}</option>`).join('');

function getDateOfBirthValue(prefix) {
  const month = document.getElementById(`${prefix}-month`).value;
  const dayRaw = document.getElementById(`${prefix}-day`).value;
  const year = document.getElementById(`${prefix}-year`).value;

  if (!month || !dayRaw || !year) return '';

  const day = dayRaw.padStart(2, '0');
  const dob = `${year}-${month}-${day}`;
  const parsed = new Date(`${dob}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return '';
  }

  return dob;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Onboarding Orchestrator ──────────────────────────────────────────────────

const Onboarding = {
  currentStep: 0,
  steps: ['welcome', 'restore', 'profile', 'targets', 'complete'],

  async init(container, { initialStep = 'welcome' } = {}) {
    this.container = container;
    this.currentStep = Math.max(0, this.steps.indexOf(initialStep));
    this.render();
  },

  render() {
    const step = this.steps[this.currentStep];
    switch (step) {
      case 'welcome':  this.renderWelcome();  break;
      case 'restore':  this.renderRestore();  break;
      case 'profile':  this.renderProfile();  break;
      case 'targets':  this.renderTargets();  break;
      case 'complete': this.renderComplete(); break;
    }
  },

  next() {
    this.currentStep = Math.min(this.currentStep + 1, this.steps.length - 1);
    this.render();
  },

  // ─── Step: Welcome ──────────────────────────────────────────────────────────

  renderWelcome() {
    this.container.innerHTML = `
      <div class="onboard-screen" id="step-welcome">
        <div class="onboard-hero">
          <div class="onboard-logo">Bite<span>Wise</span></div>
          <div class="onboard-tagline">Smart food & water tracking</div>
          <div class="onboard-actions fade-up">
            <button class="btn btn-primary btn-lg btn-full" id="btn-new-account">
              Create new profile
            </button>
            <button class="btn btn-secondary btn-lg btn-full" id="btn-restore-account">
              Restore from cloud
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-account').addEventListener('click', () => {
      this.currentStep = this.steps.indexOf('profile');
      this.render();
    });

    document.getElementById('btn-restore-account').addEventListener('click', () => {
      this.currentStep = this.steps.indexOf('restore');
      this.render();
    });
  },

  // ─── Step: Restore ─────────────────────────────────────────────────────────

  async renderRestore() {
    const [provider, clientConfig] = await Promise.all([
      Auth.getProvider(),
      Auth.getClientConfigStatus()
    ]);
    const providerLabel = provider === 'microsoft'
      ? 'OneDrive'
      : provider === 'google'
        ? 'Google Drive'
        : 'Not connected';

    this.container.innerHTML = `
      <div class="onboard-screen" id="step-restore">
        <div class="onboard-hero" style="flex:unset;padding:40px 32px 24px;">
          <div class="onboard-logo" style="font-size:2.2rem">Bite<span>Wise</span></div>
        </div>
        <div class="onboard-card">
          <div class="onboard-card-handle"></div>
          <div class="onboard-step-title fade-up fade-up-1">Restore your journal</div>
          <div class="onboard-step-sub fade-up fade-up-2">
            Connect Google Drive or OneDrive to restore an existing BiteWise backup on this device.
          </div>

          <div class="card" style="background:var(--cream-50);margin-bottom:16px;">
            <div class="card-padded">
              <div style="display:flex;justify-content:space-between;gap:12px;font-size:0.86rem;">
                <span style="color:var(--text-muted);">Provider</span>
                <span style="font-weight:600;color:var(--text-dark);">${providerLabel}</span>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
            <button class="btn btn-secondary" id="btn-onboard-onedrive">OneDrive</button>
            <button class="btn btn-secondary" id="btn-onboard-google">Google Drive</button>
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-onedrive-client-id">OneDrive client ID</label>
            <input
              class="form-input"
              type="text"
              id="onboard-onedrive-client-id"
              value="${escapeAttr(clientConfig.microsoftClientId)}"
              placeholder="Paste Microsoft Azure client ID"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="onboard-google-client-id">Google Drive client ID</label>
            <input
              class="form-input"
              type="text"
              id="onboard-google-client-id"
              value="${escapeAttr(clientConfig.googleClientId)}"
              placeholder="Paste Google OAuth client ID"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>

          <div id="restore-error" class="form-error" style="display:none;margin-bottom:12px;"></div>

          <button class="btn btn-primary btn-full btn-lg" id="btn-run-restore" ${provider ? '' : 'disabled'}>
            Restore backup
          </button>
          <button class="btn btn-ghost btn-full" id="btn-create-instead" style="margin-top:10px;">
            Create new profile instead
          </button>
        </div>
      </div>
    `;

    const errorEl = document.getElementById('restore-error');
    const showError = (message) => {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    };

    document.getElementById('btn-onboard-onedrive').addEventListener('click', async () => {
      try {
        await Auth.saveClientId('microsoft', document.getElementById('onboard-onedrive-client-id').value);
        await Auth.Microsoft.startLogin();
      } catch (err) {
        showError(err.message);
      }
    });

    document.getElementById('btn-onboard-google').addEventListener('click', async () => {
      try {
        await Auth.saveClientId('google', document.getElementById('onboard-google-client-id').value);
        await Auth.Google.startLogin();
      } catch (err) {
        showError(err.message);
      }
    });

    document.getElementById('btn-run-restore')?.addEventListener('click', async () => {
      const button = document.getElementById('btn-run-restore');
      button.disabled = true;
      button.textContent = 'Restoring...';
      errorEl.style.display = 'none';

      try {
        const result = await Sync.restore();
        if (!result.hadData) {
          showError('No BiteWise backup was found for this provider.');
          button.disabled = false;
          button.textContent = 'Restore backup';
          return;
        }
        window.dispatchEvent(new CustomEvent('onboarding-complete'));
      } catch (err) {
        showError(err.message || 'Restore failed.');
        button.disabled = false;
        button.textContent = 'Restore backup';
      }
    });

    document.getElementById('btn-create-instead').addEventListener('click', () => {
      this.currentStep = this.steps.indexOf('profile');
      this.render();
    });
  },

  // ─── Step: Profile ──────────────────────────────────────────────────────────

  renderProfile() {
    this.container.innerHTML = `
      <div class="onboard-screen" id="step-profile">
        <div class="onboard-hero" style="flex:unset;padding:40px 32px 24px;">
          <div class="onboard-logo" style="font-size:2.2rem">Bite<span>Wise</span></div>
        </div>
        <div class="onboard-card">
          <div class="onboard-card-handle"></div>
          <div class="progress-dots">
            <div class="progress-dot done"></div>
            <div class="progress-dot active"></div>
            <div class="progress-dot"></div>
          </div>
          <div class="onboard-step-title fade-up fade-up-1">Tell us about yourself</div>
          <div class="onboard-step-sub fade-up fade-up-2">
            This stays on your device only. We use your birthday to provide age-relevant guidance.
          </div>

          <form id="profile-form" novalidate>
            <div class="form-group fade-up fade-up-2">
              <label class="form-label" for="input-name">
                Full name <span class="required">*</span>
              </label>
              <input
                class="form-input"
                type="text"
                id="input-name"
                placeholder="Your full name"
                autocomplete="name"
                required
              />
            </div>

            <div class="form-group fade-up fade-up-3">
              <label class="form-label" for="input-dob-month">
                Date of birth <span class="required">*</span>
              </label>
              <div class="date-fields">
                <select class="form-select" id="input-dob-month" aria-label="Birth month" required>
                  <option value="">Month</option>
                  ${monthOptions}
                </select>
                <input
                  class="form-input"
                  type="number"
                  id="input-dob-day"
                  min="1"
                  max="31"
                  placeholder="Day"
                  aria-label="Birth day"
                  inputmode="numeric"
                  required
                />
                <input
                  class="form-input"
                  type="number"
                  id="input-dob-year"
                  min="1900"
                  max="${new Date().getFullYear()}"
                  placeholder="Year"
                  aria-label="Birth year"
                  inputmode="numeric"
                  required
                />
              </div>
            </div>

            <div class="form-group fade-up fade-up-4">
              <label class="form-label" for="input-email">
                Email address <span class="required">*</span>
              </label>
              <input
                class="form-input"
                type="email"
                id="input-email"
                placeholder="you@example.com"
                autocomplete="email"
                required
              />
              <div class="form-hint">Used only to identify your local profile.</div>
            </div>

            <div class="form-group fade-up fade-up-4">
              <label class="form-label" for="input-units">
                Water tracking units
              </label>
              <select class="form-select" id="input-units">
                <option value="oz">Fluid ounces (oz)</option>
                <option value="ml">Milliliters (ml)</option>
              </select>
            </div>

            <div id="profile-error" class="form-error" style="display:none;margin-bottom:12px;"></div>

            <button class="btn btn-primary btn-full btn-lg fade-up fade-up-4" type="submit">
              Continue
            </button>
          </form>
        </div>
      </div>
    `;

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name  = document.getElementById('input-name').value.trim();
      const dob   = getDateOfBirthValue('input-dob');
      const email = document.getElementById('input-email').value.trim();
      const units = document.getElementById('input-units').value;
      const errorEl = document.getElementById('profile-error');

      if (!name || !dob || !email) {
        errorEl.textContent = 'Please fill in all required fields with a valid date of birth.';
        errorEl.style.display = 'block';
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';

      try {
        await Profile.save({
          name,
          dob,
          email,
          water_unit: units,
          onboarding_complete: false,
          created_at: new Date().toISOString()
        });
        this.next();
      } catch (err) {
        errorEl.textContent = 'Failed to save profile. Please try again.';
        errorEl.style.display = 'block';
        console.error('Profile save error:', err);
      }
    });
  },

  // ─── Step: Targets ──────────────────────────────────────────────────────────

  async renderTargets() {
    const profile = await Profile.get();
    const waterUnit = profile?.water_unit || 'oz';

    this.container.innerHTML = `
      <div class="onboard-screen" id="step-targets">
        <div class="onboard-hero" style="flex:unset;padding:40px 32px 24px;">
          <div class="onboard-logo" style="font-size:2.2rem">Bite<span>Wise</span></div>
        </div>
        <div class="onboard-card">
          <div class="onboard-card-handle"></div>
          <div class="progress-dots">
            <div class="progress-dot done"></div>
            <div class="progress-dot done"></div>
            <div class="progress-dot active"></div>
          </div>
          <div class="onboard-step-title fade-up fade-up-1">Set daily goals</div>
          <div class="onboard-step-sub fade-up fade-up-2">
            These are optional and can be changed later in Settings.
          </div>

          <form id="targets-form" novalidate>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="form-group fade-up fade-up-2">
                <label class="form-label" for="onboard-t-calories">Calories (kcal)</label>
                <input class="form-input" type="number" id="onboard-t-calories" placeholder="e.g. 2000" min="0" inputmode="decimal" />
              </div>
              <div class="form-group fade-up fade-up-2">
                <label class="form-label" for="onboard-t-protein">Protein (g)</label>
                <input class="form-input" type="number" id="onboard-t-protein" placeholder="optional" min="0" inputmode="decimal" />
              </div>
              <div class="form-group fade-up fade-up-3">
                <label class="form-label" for="onboard-t-carbs">Carbs (g)</label>
                <input class="form-input" type="number" id="onboard-t-carbs" placeholder="optional" min="0" inputmode="decimal" />
              </div>
              <div class="form-group fade-up fade-up-3">
                <label class="form-label" for="onboard-t-fat">Fat (g)</label>
                <input class="form-input" type="number" id="onboard-t-fat" placeholder="optional" min="0" inputmode="decimal" />
              </div>
              <div class="form-group fade-up fade-up-4">
                <label class="form-label" for="onboard-t-water">Water (${waterUnit})</label>
                <input class="form-input" type="number" id="onboard-t-water" placeholder="optional" min="0" inputmode="decimal" />
              </div>
            </div>

            <div id="targets-error" class="form-error" style="display:none;margin-bottom:12px;"></div>

            <button class="btn btn-primary btn-full btn-lg fade-up fade-up-4" type="submit">
              Save goals
            </button>
            <button class="btn btn-ghost btn-full fade-up fade-up-4" id="btn-skip-targets" type="button" style="margin-top:10px;">
              Skip for now
            </button>
          </form>
        </div>
      </div>
    `;

    const val = (id) => {
      const v = parseFloat(document.getElementById(id).value);
      return Number.isNaN(v) ? null : v;
    };

    const finish = async ({ saveTargets }) => {
      const errorEl = document.getElementById('targets-error');
      errorEl.style.display = 'none';

      try {
        if (saveTargets) {
          await Targets.save({
            calories:   val('onboard-t-calories'),
            protein:    val('onboard-t-protein'),
            carbs:      val('onboard-t-carbs'),
            fat:        val('onboard-t-fat'),
            water:      val('onboard-t-water'),
            water_unit: waterUnit
          });
        }
        await this.completeOnboarding();
      } catch (err) {
        errorEl.textContent = 'Failed to save goals. Please try again.';
        errorEl.style.display = 'block';
        console.error('Targets save error:', err);
      }
    };

    document.getElementById('targets-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await finish({ saveTargets: true });
    });

    document.getElementById('btn-skip-targets').addEventListener('click', async () => {
      await finish({ saveTargets: false });
    });
  },

  // ─── Step: Complete ─────────────────────────────────────────────────────────

  renderComplete() {
    this.container.innerHTML = `
      <div class="onboard-screen" id="step-complete">
        <div class="onboard-hero">
          <div style="font-size:64px;margin-bottom:16px;">🥗</div>
          <div class="onboard-logo">You're all set!</div>
          <div class="onboard-tagline" style="margin-bottom:32px;">
            Your BiteWise journal is ready.
          </div>
          <div class="onboard-actions fade-up">
            <button class="btn btn-primary btn-lg btn-full" id="btn-enter-app">
              Start tracking
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-enter-app').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('onboarding-complete'));
    });
  },

  // ─── Completion ─────────────────────────────────────────────────────────────

  async completeOnboarding() {
    const profile = await Profile.get();
    await Profile.save({ ...profile, onboarding_complete: true });
    this.next();
  }
};

export { Onboarding };
