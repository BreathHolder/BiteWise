// config.example.js
// Copy this file to config.js and fill in your values.
// config.js is gitignored and will never be committed to the repository.
//
// See README.md for full instructions on registering your own OAuth apps.

export const CONFIG = {
  // Microsoft Azure App Registration client ID
  // Register at: https://portal.azure.com → Azure Active Directory → App registrations
  // Supported account types: Personal Microsoft accounts only
  // Redirect URI (Single-page application): https://breathholder.github.io/BiteWise/
  MICROSOFT_CLIENT_ID: '',

  // Google OAuth 2.0 Client ID
  // Register at: https://console.cloud.google.com → APIs & Services → Credentials
  // Authorized redirect URI: https://breathholder.github.io/BiteWise/
  // Required API: Google Drive API (enable under APIs & Services → Library)
  GOOGLE_CLIENT_ID: '',

  // USDA FoodData Central API key (optional)
  // You can also enter this in BiteWise under Settings -> USDA API key.
  // Register a free key at: https://fdc.nal.usda.gov/api-key-signup/
  USDA_API_KEY: 'DEMO_KEY'
};
