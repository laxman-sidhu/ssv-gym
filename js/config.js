/* ==========================================================================
   SSV GYM — FRONTEND CONFIGURATION
   --------------------------------------------------------------------------
   Everything in this file is sent to every visitor's browser. It is PUBLIC.

   SAFE here  : Apps Script web-app URL, Google Sheet ID, Cloudinary cloud
                name, an UNSIGNED upload preset (only in "unsigned" mode).
   NEVER here : Cloudinary API secret, admin password, Google credentials,
                private tokens. Those live in Apps Script > Script Properties.
   ========================================================================== */
const CONFIG = Object.freeze({
  // Google Apps Script web-app URL (Deploy > Web app > URL ending in /exec).
  // While this is a placeholder the site shows the sample data from js/data.js.
  API_URL: "YOUR_APPS_SCRIPT_URL",

  // Reference only. The website never reads the sheet directly.
  GOOGLE_SHEET_ID: "YOUR_GOOGLE_SHEET_ID",

  // Image uploads from the admin panel.
  //   "signed"   (recommended) Apps Script signs each upload for signed-in admins.
  //              The API secret stays in Script Properties; nothing below is needed.
  //   "unsigned" Uses the cloud name + unsigned preset below. Anyone who reads
  //              this file could upload to that preset, so restrict it in Cloudinary.
  CLOUDINARY_UPLOAD_MODE: "signed",
  CLOUDINARY_CLOUD_NAME: "YOUR_CLOUDINARY_CLOUD_NAME",
  CLOUDINARY_UPLOAD_PRESET: "YOUR_CLOUDINARY_UPLOAD_PRESET",
  CLOUDINARY_FOLDER: "ssv-gym",
  MAX_UPLOAD_MB: 10,

  // Behaviour
  REQUEST_TIMEOUT_MS: 10000, // wait this long for the API before using saved/sample content
  CACHE_MINUTES: 5,          // how long a browser reuses downloaded content
  SHOW_SAMPLE_NOTICE: true   // small notice when sample (fallback) content is on screen
});
