// onboarding.js - First-run setup flow
// Steps: welcome → profile → cloud backup (optional) → complete

import { Profile } from './db.js';
import { Auth } from './auth.js';
import { Sync } from './sync.js';
import { showToast } from './app.js';

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

// ─── Onboarding Orchestrator ──────────────────────────────────────────────────

const Onboarding = {
  currentStep: 0,
  steps: ['welcome', 'profile', 'backup', 'complete'],

  async init(container) {
    this.container = container;
    this.render();
  },

  render() {
    const step = this.steps[this.currentStep];
    switch (step) {
      case 'welcome':  this.renderWelcome();  break;
      case 'profile':  this.renderProfile();  break;
      case 'backup':   this.renderBackup();   break;
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
              Get started
            </button>
            <button class="btn btn-secondary btn-lg btn-full" id="btn-restore">
              Restore from backup
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-account').addEventListener('click', () => {
      this.next();
    });

    document.getElementById('btn-restore').addEventListener('click', () => {
      this.renderRestoreFlow();
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

  // ─── Step: Backup ──────────────────────────────────────────────────────────

  renderBackup() {
    this.container.innerHTML = `
      <div class="onboard-screen" id="step-backup">
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
          <div class="onboard-step-title fade-up fade-up-1">Back up your data</div>
          <div class="onboard-step-sub fade-up fade-up-2">
            Connect a cloud drive to keep your data safe and accessible across devices.
            Your data is stored only on your device and your chosen cloud drive — never on any server.
          </div>

          <div class="fade-up fade-up-2">
            <div class="provider-option" id="opt-onedrive" role="button" tabindex="0">
              <div class="provider-icon microsoft">☁️</div>
              <div class="provider-info">
                <h3>OneDrive</h3>
                <p>Microsoft personal account</p>
              </div>
            </div>

            <div class="provider-option" id="opt-google" role="button" tabindex="0">
              <div class="provider-icon google">🔵</div>
              <div class="provider-info">
                <h3>Google Drive</h3>
                <p>Google personal account</p>
              </div>
            </div>
          </div>

          <div id="backup-status" style="display:none;margin:12px 0;" class="form-hint"></div>

          <div style="margin-top:20px;" class="fade-up fade-up-3">
            <button class="btn btn-ghost btn-full" id="btn-skip-backup">
              Skip for now — I'll set this up later
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('opt-onedrive').addEventListener('click', async () => {
      try {
        await Auth.Microsoft.startLogin();
      } catch (err) {
        showToast(err.message, 'error', 6000);
      }
    });

    document.getElementById('opt-google').addEventListener('click', async () => {
      try {
        await Auth.Google.startLogin();
      } catch (err) {
        showToast(err.message, 'error', 6000);
      }
    });

    document.getElementById('btn-skip-backup').addEventListener('click', async () => {
      await this.completeOnboarding();
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

  // ─── Restore Flow ───────────────────────────────────────────────────────────

  renderRestoreFlow() {
    this.container.innerHTML = `
      <div class="onboard-screen" id="step-restore">
        <div class="onboard-hero" style="flex:unset;padding:40px 32px 24px;">
          <div class="onboard-logo" style="font-size:2.2rem">Bite<span>Wise</span></div>
        </div>
        <div class="onboard-card">
          <div class="onboard-card-handle"></div>
          <div class="onboard-step-title fade-up fade-up-1">Restore your data</div>
          <div class="onboard-step-sub fade-up fade-up-2">
            Connect to the cloud drive where your BiteWise backup is stored.
          </div>

          <div class="fade-up fade-up-2">
            <div class="provider-option" id="restore-onedrive" role="button" tabindex="0">
              <div class="provider-icon microsoft">☁️</div>
              <div class="provider-info">
                <h3>Restore from OneDrive</h3>
                <p>Microsoft personal account</p>
              </div>
            </div>

            <div class="provider-option" id="restore-google" role="button" tabindex="0">
              <div class="provider-icon google">🔵</div>
              <div class="provider-info">
                <h3>Restore from Google Drive</h3>
                <p>Google personal account</p>
              </div>
            </div>
          </div>

          <div style="margin-top:20px;" class="fade-up fade-up-3">
            <button class="btn btn-ghost btn-full" id="btn-back-welcome">
              ← Back
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('restore-onedrive').addEventListener('click', async () => {
      try {
        sessionStorage.setItem('restore_mode', 'true');
        await Auth.Microsoft.startLogin();
      } catch (err) {
        showToast(err.message, 'error', 6000);
      }
    });

    document.getElementById('restore-google').addEventListener('click', async () => {
      try {
        sessionStorage.setItem('restore_mode', 'true');
        await Auth.Google.startLogin();
      } catch (err) {
        showToast(err.message, 'error', 6000);
      }
    });

    document.getElementById('btn-back-welcome').addEventListener('click', () => {
      this.currentStep = 0;
      this.render();
    });
  },

  // ─── Completion ─────────────────────────────────────────────────────────────

  async completeOnboarding() {
    try {
      const profile = await Profile.get();
      await Profile.save({ ...profile, onboarding_complete: true });
    } catch (err) {
      console.error('Error completing onboarding:', err);
    }
    this.next();
  },

  // ─── OAuth Callback Handling ────────────────────────────────────────────────

  async handleAuthCallback(result) {
    if (!result.success) {
      showToast(result.error || 'Authentication failed. Please try again.', 'error');
      return;
    }

    const isRestoreMode = sessionStorage.getItem('restore_mode') === 'true';
    sessionStorage.removeItem('restore_mode');

    if (isRestoreMode) {
      showToast('Connected! Restoring your data...', 'info');
      try {
        const restoreResult = await Sync.restore();
        if (restoreResult.hadData) {
          showToast('Data restored successfully!', 'success');
          await this.completeOnboarding();
        } else {
          showToast('No backup found. Starting fresh.', 'info');
          this.currentStep = 1; // Go to profile step
          this.render();
        }
      } catch (err) {
        showToast('Restore failed: ' + err.message, 'error');
      }
    } else {
      // Backup setup during onboarding
      const provider = result.provider === 'microsoft' ? 'OneDrive' : 'Google Drive';
      showToast(`${provider} connected!`, 'success');
      await this.completeOnboarding();
    }
  }
};

export { Onboarding };
