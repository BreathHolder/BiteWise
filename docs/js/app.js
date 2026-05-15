// app.js - BiteWise application bootstrap, router, and toast system

import { Profile, openDB } from './db.js';
import { Onboarding } from './onboarding.js';
import { LogScreen } from './log.js';
import { DashboardScreen } from './dashboard.js';
import { SettingsScreen } from './settings.js';

// ─── Toast System ─────────────────────────────────────────────────────────────

/**
 * Display a toast notification at the bottom of the screen.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration - ms before auto-dismiss
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ─── App Router ───────────────────────────────────────────────────────────────

const App = {
  currentTab: 'dashboard',

  tabs: {
    dashboard: {
      label: 'Dashboard',
      icon: '📊',
      screen: DashboardScreen
    },
    log: {
      label: 'Log',
      icon: '🍽️',
      screen: LogScreen
    },
    settings: {
      label: 'Settings',
      icon: '⚙️',
      screen: SettingsScreen
    }
  },

  async init() {
    // Ensure DB is open before anything else
    await openDB();

    // Check if user has completed onboarding
    const profileExists = await Profile.exists();

    if (!profileExists) {
      // First run: show onboarding
      await this.startOnboarding();
    } else {
      // Existing user: show main app
      this.renderApp();
    }
  },

  // ─── Onboarding ─────────────────────────────────────────────────────────────

  async startOnboarding() {
    const root = document.getElementById('app');
    root.innerHTML = '<div id="onboarding-container"></div><div id="toast-container"></div>';

    const container = document.getElementById('onboarding-container');
    await Onboarding.init(container);

    // Listen for onboarding completion
    window.addEventListener('onboarding-complete', async () => {
      this.renderApp();
    }, { once: true });
  },

  // ─── Main App Shell ──────────────────────────────────────────────────────────

  renderApp() {
    const root = document.getElementById('app');
    root.innerHTML = `
      <div class="app-layout">
        <div class="page-content" id="main-content" style="padding-bottom:calc(var(--nav-height) + 24px);">
          <!-- Screen content renders here -->
        </div>

        <nav class="bottom-nav" role="navigation" aria-label="Main navigation">
          ${Object.entries(this.tabs).map(([key, tab]) => `
            <button
              class="nav-item ${key === this.currentTab ? 'active' : ''}"
              data-tab="${key}"
              aria-label="${tab.label}"
              aria-current="${key === this.currentTab ? 'page' : 'false'}"
            >
              <span class="nav-icon" aria-hidden="true">${tab.icon}</span>
              <span class="nav-label">${tab.label}</span>
            </button>
          `).join('')}
        </nav>
      </div>

      <div id="toast-container"></div>
    `;

    // Nav tab switching
    root.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.navigateTo(btn.dataset.tab);
      });
    });

    // Render initial screen
    this.renderCurrentTab();
  },

  navigateTo(tab) {
    if (!this.tabs[tab]) return;
    this.currentTab = tab;

    // Update nav active state
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-current', btn.dataset.tab === tab ? 'page' : 'false');
    });

    this.renderCurrentTab();
  },

  async renderCurrentTab() {
    const content = document.getElementById('main-content');
    if (!content) return;

    content.innerHTML = '';

    const screenContainer = document.createElement('div');
    screenContainer.className = 'screen active';
    content.appendChild(screenContainer);

    try {
      await this.tabs[this.currentTab].screen.render(screenContainer);
    } catch (err) {
      console.error(`Error rendering ${this.currentTab}:`, err);
      screenContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Something went wrong</div>
          <div class="empty-sub">${err.message}</div>
        </div>
      `;
    }
  }
};

// ─── Service Worker Registration ─────────────────────────────────────────────

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/BiteWise/sw.js', {
        scope: '/BiteWise/',
        type: 'module'
      });
      console.log('Service worker registered:', reg.scope);
    } catch (err) {
      console.warn('Service worker registration failed:', err);
    }
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await registerServiceWorker();
  await App.init();
});

export { showToast, App };
