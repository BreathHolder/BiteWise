// auth.js - OAuth 2.0 authentication for OneDrive (Microsoft) and Google Drive
// Tokens are stored in IndexedDB (SyncMeta store) only. Nothing is sent to GitHub Pages servers.
//
// SETUP REQUIRED:
// Copy docs/js/config.example.js to docs/js/config.js and fill in your client IDs.
// config.js is gitignored and will never be committed to the repository.
// Each user of this app registers their own OAuth apps — see README.md for instructions.

import { SyncMeta } from './db.js';

// ─── OAuth App Configuration ──────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  MICROSOFT_CLIENT_ID: '',
  GOOGLE_CLIENT_ID: ''
};
let configPromise = null;

async function getConfig() {
  if (!configPromise) {
    configPromise = import('./config.js')
      .then(module => ({ ...DEFAULT_CONFIG, ...(module.CONFIG || {}) }))
      .catch(() => DEFAULT_CONFIG);
  }
  return configPromise;
}

function getRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function getMicrosoftConfig() {
  const config = await getConfig();
  return {
    client_id: config.MICROSOFT_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/consumers',
    scopes: ['Files.ReadWrite', 'User.Read', 'offline_access'],
    redirect_uri: getRedirectUri()
  };
}

async function getGoogleConfig() {
  const config = await getConfig();
  return {
    client_id: config.GOOGLE_CLIENT_ID,
    scopes: [
      'https://www.googleapis.com/auth/drive.appdata',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    redirect_uri: getRedirectUri()
  };
}

const MICROSOFT_CONFIG = {
  client_id: '',
  authority: 'https://login.microsoftonline.com/consumers',
  scopes: ['Files.ReadWrite', 'User.Read', 'offline_access'],
  redirect_uri: ''
};

const GOOGLE_CONFIG = {
  client_id: '',
  scopes: [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.profile'
  ],
  redirect_uri: ''
};

// ─── Token Storage Keys ────────────────────────────────────────────────────────

const KEYS = {
  MICROSOFT_TOKEN: 'microsoft_token',
  GOOGLE_TOKEN: 'google_token',
  PROVIDER: 'sync_provider'          // 'microsoft' | 'google' | null
};

// ─── PKCE Utilities ────────────────────────────────────────────────────────────
// Both providers support PKCE (Proof Key for Code Exchange), which removes the
// need for a backend client secret when using the Authorization Code flow.

/**
 * Generate a cryptographically secure random string for use as a PKCE verifier.
 */
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Derive the PKCE code_challenge from the verifier using SHA-256.
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate a random state string for CSRF protection.
 */
function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Microsoft / OneDrive Auth ────────────────────────────────────────────────

const Microsoft = {
  /**
   * Initiate the Microsoft OAuth PKCE flow.
   * Saves the verifier and state to sessionStorage, then redirects to Microsoft.
   */
  async startLogin() {
    const config = await getMicrosoftConfig();
    if (!config.client_id) {
      throw new Error('Microsoft client ID is not configured. Copy config.example.js to config.js and add your client ID.');
    }
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = generateState();

    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_provider', 'microsoft');

    const params = new URLSearchParams({
      client_id: config.client_id,
      response_type: 'code',
      redirect_uri: config.redirect_uri,
      scope: config.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      response_mode: 'query'
    });

    window.location.href = `${config.authority}/oauth2/v2.0/authorize?${params}`;
  },

  /**
   * Exchange the authorization code for tokens.
   * Microsoft's token endpoint supports CORS from browsers.
   */
  async handleCallback(code, state) {
    const config = await getMicrosoftConfig();
    const savedState = sessionStorage.getItem('oauth_state');
    const verifier = sessionStorage.getItem('pkce_verifier');

    if (state !== savedState) throw new Error('OAuth state mismatch. Possible CSRF.');

    const body = new URLSearchParams({
      client_id: config.client_id,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirect_uri,
      code_verifier: verifier
    });

    const response = await fetch(`${config.authority}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Microsoft token exchange failed: ${err.error_description}`);
    }

    const tokens = await response.json();
    await this.saveTokens(tokens);

    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_provider');

    await SyncMeta.set(KEYS.PROVIDER, { value: 'microsoft' });
    return tokens;
  },

  async saveTokens(tokens) {
    const expiry = Date.now() + (tokens.expires_in * 1000);
    await SyncMeta.set(KEYS.MICROSOFT_TOKEN, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry
    });
  },

  async getAccessToken() {
    const record = await SyncMeta.get(KEYS.MICROSOFT_TOKEN);
    if (!record) return null;

    // Refresh if within 5 minutes of expiry
    if (Date.now() > record.expiry - 300000) {
      return await this.refreshToken(record.refresh_token);
    }

    return record.access_token;
  },

  async refreshToken(refreshToken) {
    const config = await getMicrosoftConfig();
    const body = new URLSearchParams({
      client_id: config.client_id,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: config.scopes.join(' ')
    });

    const response = await fetch(`${config.authority}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) throw new Error('Microsoft token refresh failed');

    const tokens = await response.json();
    await this.saveTokens(tokens);
    return tokens.access_token;
  },

  async disconnect() {
    await SyncMeta.remove(KEYS.MICROSOFT_TOKEN);
    await SyncMeta.remove(KEYS.PROVIDER);
  },

  async isConnected() {
    const record = await SyncMeta.get(KEYS.MICROSOFT_TOKEN);
    return !!record?.access_token;
  }
};

// ─── Google Drive Auth ────────────────────────────────────────────────────────

const Google = {
  async startLogin() {
    const config = await getGoogleConfig();
    if (!config.client_id) {
      throw new Error('Google client ID is not configured. Copy config.example.js to config.js and add your client ID.');
    }
    const state = generateState();

    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_provider', 'google');

    const params = new URLSearchParams({
      client_id: config.client_id,
      response_type: 'token',
      redirect_uri: config.redirect_uri,
      scope: config.scopes.join(' '),
      state,
      include_granted_scopes: 'true',
      prompt: 'consent'
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async handleCallback(code, state) {
    const config = await getGoogleConfig();
    const savedState = sessionStorage.getItem('oauth_state');
    const verifier = sessionStorage.getItem('pkce_verifier');

    if (state !== savedState) throw new Error('OAuth state mismatch. Possible CSRF.');

    // Google token exchange requires a backend or a proxy due to CORS restrictions
    // on their token endpoint. We use a minimal CORS-friendly approach here.
    // NOTE: Google's /token endpoint does NOT support browser-direct CORS for
    // authorization_code grants. You will need to either:
    //   (a) Use a lightweight proxy (e.g., a free Cloudflare Worker), or
    //   (b) Switch to the implicit/token flow (access_token only, no refresh).
    // For now we implement the direct attempt and surface a clear error if it fails.

    const body = new URLSearchParams({
      client_id: config.client_id,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirect_uri,
      code_verifier: verifier
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Google token exchange failed: ${err.error_description || err.error}`);
    }

    const tokens = await response.json();
    await this.saveTokens(tokens);

    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('oauth_provider');

    await SyncMeta.set(KEYS.PROVIDER, { value: 'google' });
    return tokens;
  },

  async saveTokens(tokens) {
    const expiry = Date.now() + (tokens.expires_in * 1000);
    await SyncMeta.set(KEYS.GOOGLE_TOKEN, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expiry
    });
  },

  async getAccessToken() {
    const record = await SyncMeta.get(KEYS.GOOGLE_TOKEN);
    if (!record) return null;

    if (Date.now() > record.expiry - 300000) {
      if (record.refresh_token) return await this.refreshToken(record.refresh_token);
      return null; // Token expired, re-auth needed
    }

    return record.access_token;
  },

  async refreshToken(refreshToken) {
    const config = await getGoogleConfig();
    const body = new URLSearchParams({
      client_id: config.client_id,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) throw new Error('Google token refresh failed');

    const tokens = await response.json();
    await this.saveTokens({ ...tokens, refresh_token: refreshToken });
    return tokens.access_token;
  },

  async disconnect() {
    await SyncMeta.remove(KEYS.GOOGLE_TOKEN);
    await SyncMeta.remove(KEYS.PROVIDER);
  },

  async isConnected() {
    const record = await SyncMeta.get(KEYS.GOOGLE_TOKEN);
    return !!record?.access_token;
  }
};

// ─── Unified Auth Interface ───────────────────────────────────────────────────

const Auth = {
  Microsoft,
  Google,

  /**
   * Get the currently configured sync provider ('microsoft' | 'google' | null).
   */
  async getProvider() {
    const record = await SyncMeta.get(KEYS.PROVIDER);
    return record?.value || null;
  },

  /**
   * Handle OAuth redirect callbacks. Call this on app startup.
   * Returns { provider, success } or null if not a callback URL.
   */
  async handleRedirectIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error') || hashParams.get('error');
    const accessToken = hashParams.get('access_token');

    if (!code && !accessToken && !error) return null;

    // Clean the URL immediately to avoid re-processing
    window.history.replaceState({}, document.title, window.location.pathname);

    if (error) {
      return { success: false, error: params.get('error_description') || error };
    }

    const provider = sessionStorage.getItem('oauth_provider');

    try {
      if (provider === 'google' && accessToken) {
        const hashState = hashParams.get('state');
        const savedState = sessionStorage.getItem('oauth_state');
        if (hashState !== savedState) throw new Error('OAuth state mismatch. Possible CSRF.');
        await Google.saveTokens({
          access_token: accessToken,
          expires_in: Number(hashParams.get('expires_in') || 3600)
        });
        sessionStorage.removeItem('oauth_state');
        sessionStorage.removeItem('oauth_provider');
        await SyncMeta.set(KEYS.PROVIDER, { value: 'google' });
        return { provider: 'google', success: true };
      }

      if (provider === 'microsoft') {
        await Microsoft.handleCallback(code, state);
        return { provider: 'microsoft', success: true };
      } else if (provider === 'google') {
        await Google.handleCallback(code, state);
        return { provider: 'google', success: true };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }

    return null;
  },

  /**
   * Disconnect from all providers.
   */
  async disconnectAll() {
    await Microsoft.disconnect();
    await Google.disconnect();
  }
};

export { Auth, Microsoft, Google, MICROSOFT_CONFIG, GOOGLE_CONFIG };
