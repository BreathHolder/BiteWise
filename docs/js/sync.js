// sync.js - Cloud backup and restore via OneDrive or Google Drive
// Data is written as a single JSON file: bitewise-backup.json
// OneDrive: stored in /Apps/BiteWise/ via Microsoft Graph API
// Google Drive: stored in the app's hidden appDataFolder

import { Auth } from './auth.js';
import { exportAllData, importAllData, SyncMeta } from './db.js';

const BACKUP_FILENAME = 'bitewise-backup.json';
const LAST_SYNC_KEY = 'last_sync';

// ─── Microsoft OneDrive ───────────────────────────────────────────────────────

const OneDrive = {
  BASE_URL: 'https://graph.microsoft.com/v1.0',

  async upload(data) {
    const token = await Auth.Microsoft.getAccessToken();
    if (!token) throw new Error('Microsoft not authenticated');

    const json = JSON.stringify(data, null, 2);
    const path = encodeURIComponent(BACKUP_FILENAME);

    // PUT to /me/drive/special/approot:/{filename}:/content
    // Creates or overwrites the file in the app's special folder
    const response = await fetch(
      `${this.BASE_URL}/me/drive/special/approot:/${path}:/content`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: json
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`OneDrive upload failed: ${err.error?.message || response.status}`);
    }

    return response.json();
  },

  async download() {
    const token = await Auth.Microsoft.getAccessToken();
    if (!token) throw new Error('Microsoft not authenticated');

    const path = encodeURIComponent(BACKUP_FILENAME);

    const response = await fetch(
      `${this.BASE_URL}/me/drive/special/approot:/${path}:/content`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`OneDrive download failed: ${response.status}`);

    return response.json();
  }
};

// ─── Google Drive ─────────────────────────────────────────────────────────────

const GoogleDrive = {
  BASE_URL: 'https://www.googleapis.com',

  /**
   * Find the backup file ID in Google Drive appDataFolder.
   * Returns the file ID string or null if not found.
   */
  async findBackupFileId(token) {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'files(id,name)',
      q: `name='${BACKUP_FILENAME}'`
    });

    const response = await fetch(
      `${this.BASE_URL}/drive/v3/files?${params}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) throw new Error(`Google Drive file list failed: ${response.status}`);

    const data = await response.json();
    return data.files?.[0]?.id || null;
  },

  async upload(data) {
    const token = await Auth.Google.getAccessToken();
    if (!token) throw new Error('Google not authenticated');

    const json = JSON.stringify(data, null, 2);
    const existingId = await this.findBackupFileId(token);

    if (existingId) {
      // Update existing file content
      const response = await fetch(
        `${this.BASE_URL}/upload/drive/v3/files/${existingId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: json
        }
      );

      if (!response.ok) throw new Error(`Google Drive update failed: ${response.status}`);
      return response.json();

    } else {
      // Create new file in appDataFolder
      const metadata = {
        name: BACKUP_FILENAME,
        parents: ['appDataFolder']
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([json], { type: 'application/json' }));

      const response = await fetch(
        `${this.BASE_URL}/upload/drive/v3/files?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form
        }
      );

      if (!response.ok) throw new Error(`Google Drive create failed: ${response.status}`);
      return response.json();
    }
  },

  async download() {
    const token = await Auth.Google.getAccessToken();
    if (!token) throw new Error('Google not authenticated');

    const fileId = await this.findBackupFileId(token);
    if (!fileId) return null;

    const response = await fetch(
      `${this.BASE_URL}/drive/v3/files/${fileId}?alt=media`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) throw new Error(`Google Drive download failed: ${response.status}`);
    return response.json();
  }
};

// ─── Unified Sync Interface ───────────────────────────────────────────────────

const Sync = {
  /**
   * Push local data to the connected cloud provider.
   * Returns { success, timestamp } or throws.
   */
  async backup() {
    const provider = await Auth.getProvider();
    if (!provider) throw new Error('No cloud provider connected');

    const data = await exportAllData();

    if (provider === 'microsoft') {
      await OneDrive.upload(data);
    } else if (provider === 'google') {
      await GoogleDrive.upload(data);
    }

    const timestamp = new Date().toISOString();
    await SyncMeta.set(LAST_SYNC_KEY, { value: timestamp });
    return { success: true, timestamp };
  },

  /**
   * Pull data from the connected cloud provider and replace local data.
   * Returns { success, hadData } or throws.
   */
  async restore() {
    const provider = await Auth.getProvider();
    if (!provider) throw new Error('No cloud provider connected');

    let data = null;
    if (provider === 'microsoft') {
      data = await OneDrive.download();
    } else if (provider === 'google') {
      data = await GoogleDrive.download();
    }

    if (!data) return { success: true, hadData: false };

    await importAllData(data);
    const timestamp = new Date().toISOString();
    await SyncMeta.set(LAST_SYNC_KEY, { value: timestamp });
    return { success: true, hadData: true };
  },

  /**
   * Check if a backup exists in the cloud without downloading it.
   */
  async checkForExistingBackup() {
    const provider = await Auth.getProvider();
    if (!provider) return false;

    try {
      if (provider === 'microsoft') {
        const token = await Auth.Microsoft.getAccessToken();
        if (!token) return false;
        const path = encodeURIComponent(BACKUP_FILENAME);
        const response = await fetch(
          `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${path}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        return response.ok;
      } else if (provider === 'google') {
        const token = await Auth.Google.getAccessToken();
        if (!token) return false;
        const id = await GoogleDrive.findBackupFileId(token);
        return !!id;
      }
    } catch {
      return false;
    }

    return false;
  },

  /**
   * Get the last successful sync timestamp.
   */
  async getLastSyncTime() {
    const record = await SyncMeta.get(LAST_SYNC_KEY);
    return record?.value || null;
  },

  /**
   * Format the last sync time as a human-readable string.
   */
  async getLastSyncDisplay() {
    const ts = await this.getLastSyncTime();
    if (!ts) return 'Never';
    const d = new Date(ts);
    return d.toLocaleString();
  }
};

export { Sync, OneDrive, GoogleDrive };
