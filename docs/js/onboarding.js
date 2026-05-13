// onboarding.js - First-run setup flow
// Steps: welcome -> profile -> complete

import { Profile } from './db.js';

// ─── Onboarding Orchestrator ──────────────────────────────────────────────────

const Onboarding = {
  currentStep: 0,
  steps: ['welcome', 'profile', 'complete'],

  async init(container) {
    this.container = container;
    this.render();
  },

  render() {
    const step = this.steps[this.currentStep];
    switch (step) {
      case 'welcome':  this.renderWelcome();  break;
      case 'profile':  this.renderProfile();  break;
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
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-new-account').addEventListener('click', () => {
      this.next();
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
              <label class="form-label" for="input-dob">
                Date of birth <span class="required">*</span>
              </label>
              <input
                class="form-input"
                type="date"
                id="input-dob"
                required
              />
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
      const dob   = document.getElementById('input-dob').value;
      const email = document.getElementById('input-email').value.trim();
      const units = document.getElementById('input-units').value;
      const errorEl = document.getElementById('profile-error');

      if (!name || !dob || !email) {
        errorEl.textContent = 'Please fill in all required fields.';
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
          onboarding_complete: true,
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
    try {
      const profile = await Profile.get();
      await Profile.save({ ...profile, onboarding_complete: true });
    } catch (err) {
      console.error('Error completing onboarding:', err);
    }
    this.next();
  }
};

export { Onboarding };
