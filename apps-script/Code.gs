/**
 * ===========================================================================
 *  SSV GYM — Google Apps Script backend (Google Sheets CMS API)
 * ===========================================================================
 *  1. Open the "SSV Gym CMS" spreadsheet > Extensions > Apps Script.
 *  2. Paste this file, save, reload the sheet.
 *  3. Sheet menu: SSV Admin > Set up / repair sheets, then Set admin password.
 *  4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *  5. Paste the /exec URL into js/config.js > API_URL.
 *
 *  SECRETS live in Project Settings > Script Properties, never in the website:
 *    ADMIN_PASSWORD_HASH / ADMIN_PASSWORD_SALT   set by the sheet menu
 *    CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET   signed image uploads
 *    NOTIFY_EMAIL   (optional)  email address for new enquiries
 *    SHEET_ID       (optional)  only if this script is NOT bound to the sheet
 * ===========================================================================
 */

const VERSION = '1.0.0';
const SESSION_SECONDS = 6 * 60 * 60;   // admin session, extended on each use
const CONTENT_CACHE_SECONDS = 300;     // public content cache
const CONTENT_CACHE_KEY = 'public_content_v1';
const MAX_LOGIN_FAILURES = 5;
const LOCK_SECONDS = 15 * 60;

/** Tab -> expected columns. Headers are matched by name, so column order may change. */
const SCHEMA = {
  General:       ['key', 'value'],
  Facilities:    ['id', 'name', 'tags', 'description', 'image_url', 'category', 'active', 'display_order'],
  Plans:         ['id', 'name', 'duration', 'price', 'description', 'features', 'featured', 'active', 'display_order'],
  Trainers:      ['id', 'name', 'role', 'specialization', 'bio', 'image_url', 'active', 'display_order'],
  Gallery:       ['id', 'image_url', 'title', 'category', 'caption', 'active', 'display_order'],
  Testimonials:  ['id', 'name', 'review', 'rating', 'image_url', 'active', 'display_order'],
  Announcements: ['id', 'title', 'description', 'date', 'expiry', 'active', 'priority'],
  Leads:         ['id', 'name', 'phone', 'message', 'date', 'status'],
  Config:        ['key', 'value']
};
const COLLECTIONS = { facilities: 'Facilities', plans: 'Plans', trainers: 'Trainers', gallery: 'Gallery', testimonials: 'Testimonials', announcements: 'Announcements' };
const ID_PREFIX = { Facilities: 'fac', Plans: 'plan', Trainers: 'tr', Gallery: 'img', Testimonials: 'rev', Announcements: 'ann', Leads: 'lead' };
const BOOLEAN_COLUMNS = ['active', 'featured'];
const LEAD_STATUSES = ['New', 'Contacted', 'Closed'];
/** Config keys the admin panel may display. Secrets never belong in the sheet. */
const VISIBLE_CONFIG_KEYS = ['GOOGLE_SHEET_ID', 'APPS_SCRIPT_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_UPLOAD_PRESET', 'CLOUDINARY_FOLDER', 'WHATSAPP_NUMBER', 'GOOGLE_MAPS_URL', 'INSTAGRAM_URL'];

/* ============================== HTTP entry points ============================== */

function doGet(e) {
  return respond_(() => {
    const action = (e && e.parameter && e.parameter.action) || 'content';
    if (action === 'health') return { status: 'ok', version: VERSION };
    const content = getPublicContent_();
    if (action === 'content') return content;
    if (Object.prototype.hasOwnProperty.call(content, action)) return content[action]; // e.g. ?action=plans
    throw apiError_('Unknown action: ' + action, 'BAD_REQUEST');
  });
}

function doPost(e) {
  return respond_(() => {
    let body;
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
    catch (err) { throw apiError_('Request body must be JSON.', 'BAD_REQUEST'); }
    const action = String(body.action || '');

    // Public actions
    if (action === 'submitEnquiry') return submitEnquiry_(body.enquiry || {});
    if (action === 'login') return login_(body.password);

    // Everything below needs a valid admin session
    requireSession_(body.token);
    switch (action) {
      case 'verify':             return { valid: true };
      case 'logout':             CacheService.getScriptCache().remove('sess_' + body.token); return { signedOut: true };
      case 'adminGetAll':        return getAdminData_();
      case 'getEnquiries':       return readTable_('Leads') || [];
      case 'saveGeneral':        return write_(() => saveKeyValues_('General', body.general));
      case 'saveRecord':         return write_(() => saveRecord_(tabFor_(body.collection), body.record));
      case 'deleteRecord':       return write_(() => deleteRecord_(tabFor_(body.collection), body.id));
      case 'reorder':            return write_(() => reorder_(tabFor_(body.collection), body.ids));
      case 'updateLeadStatus':   return write_(() => updateLeadStatus_(body.id, body.status));
      case 'getUploadSignature': return getUploadSignature_();
      default: throw apiError_('Unknown action: ' + action, 'BAD_REQUEST');
    }
  });
}

function respond_(fn) {
  let out;
  try { out = { ok: true, data: fn() }; }
  catch (err) {
    if (!err.code) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err.code ? err.message : 'Server error. Check the Apps Script executions log.', code: err.code || 'SERVER_ERROR' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function apiError_(message, code) { const e = new Error(message); e.code = code; return e; }

function write_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_('The sheet is busy. Try again in a moment.', 'BUSY');
  try {
    const result = fn();
    CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
    return result;
  } finally { lock.releaseLock(); }
}

function tabFor_(collection) {
  const tab = COLLECTIONS[collection];
  if (!tab) throw apiError_('Unknown collection: ' + collection, 'BAD_REQUEST');
  return tab;
}

/* ================================ sheet helpers ================================ */

let SS_ = null;
function ss_() {
  if (SS_) return SS_;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_) throw apiError_('Spreadsheet not found. Bind the script to the sheet or set SHEET_ID in Script Properties.', 'NOT_CONFIGURED');
  return SS_;
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw apiError_('The "' + name + '" tab is missing. In the sheet, run SSV Admin > Set up / repair sheets.', 'NOT_CONFIGURED');
  return sh;
}
function headers_(values) { return values[0].map(h => String(h).trim()); }
function tz_() { return Session.getScriptTimeZone() || 'Asia/Kolkata'; }
function isTrue_(v) { return v === true || /^(true|yes|y|1)$/i.test(String(v).trim()); }
function hex_(bytes) { return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join(''); }
function sha256Hex_(text) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }
function newId_(name) { return (ID_PREFIX[name] || 'row') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** Value read from a cell -> JSON-friendly value. Dates become yyyy-MM-dd (plus time if set). */
function cellOut_(v) {
  if (v instanceof Date) {
    const hasTime = v.getHours() || v.getMinutes();
    return Utilities.formatDate(v, tz_(), hasTime ? 'yyyy-MM-dd HH:mm' : 'yyyy-MM-dd');
  }
  return v;
}

/** Value to write. Blocks formula injection (=, +, -, @) and keeps leading zeros. */
function cellIn_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  let s = String(v).trim().slice(0, 5000);
  if (/^[=+\-@]/.test(s) || /^0\d+$/.test(s)) s = "'" + s;
  return s;
}

function readTable_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return null;
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = headers_(values);
  const keyCol = Math.max(head.indexOf('id'), head.indexOf('key'), 0);
  return values.slice(1)
    .filter(row => String(row[keyCol]).trim() !== '')
    .map(row => { const o = {}; head.forEach((h, i) => { if (h) o[h] = cellOut_(row[i]); }); return o; });
}

function readKeyValues_(name) {
  const rows = readTable_(name);
  if (!rows) return null;
  const out = {};
  rows.forEach(r => { out[String(r.key).trim()] = r.value === undefined ? '' : r.value; });
  return out;
}

/* ================================= public reads ================================= */

function getPublicContent_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CONTENT_CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const general = readKeyValues_('General') || {};
  const cfg = readKeyValues_('Config') || {};
  // Config link values are used only when the General field is empty.
  if (!general.whatsapp && cfg.WHATSAPP_NUMBER) general.whatsapp = cfg.WHATSAPP_NUMBER;
  if (!general.maps_url && cfg.GOOGLE_MAPS_URL) general.maps_url = cfg.GOOGLE_MAPS_URL;
  if (!general.instagram_url && cfg.INSTAGRAM_URL) general.instagram_url = cfg.INSTAGRAM_URL;

  const today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  const out = { general: general, updated: new Date().toISOString() };
  Object.keys(COLLECTIONS).forEach(key => {
    const rows = readTable_(COLLECTIONS[key]);
    if (rows === null) { out[key] = null; return; }   // tab missing -> site uses sample data
    let list = rows.filter(r => isTrue_(r.active));
    if (key === 'announcements') {
      list = list
        .filter(r => !r.expiry || String(r.expiry).slice(0, 10) >= today)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)));
    } else {
      list.sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
    }
    out[key] = list;
  });
  try { cache.put(CONTENT_CACHE_KEY, JSON.stringify(out), CONTENT_CACHE_SECONDS); } catch (err) { /* over 100 KB: skip cache */ }
  return out;
}

function getAdminData_() {
  const out = { general: readKeyValues_('General') || {}, leads: readTable_('Leads') || [] };
  Object.keys(COLLECTIONS).forEach(key => { out[key] = readTable_(COLLECTIONS[key]) || []; });
  const cfg = readKeyValues_('Config') || {};
  out.config = {};
  VISIBLE_CONFIG_KEYS.forEach(k => { if (k in cfg) out.config[k] = cfg[k]; });
  out.meta = { version: VERSION, cloudinaryConfigured: cloudinaryConfigured_(), timeZone: tz_() };
  return out;
}

/* ==================================== writes ==================================== */

function saveKeyValues_(name, data) {
  if (!data || typeof data !== 'object') throw apiError_('Nothing to save.', 'BAD_REQUEST');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const rowOf = {};
  values.forEach((r, i) => { if (i > 0 && String(r[0]).trim()) rowOf[String(r[0]).trim()] = i; });
  const appends = [];
  Object.keys(data).forEach(key => {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(key)) return;
    if (key in rowOf) values[rowOf[key]][1] = data[key];
    else appends.push([key, cellIn_(data[key])]);
  });
  if (values.length > 1) sh.getRange(2, 2, values.length - 1, 1).setValues(values.slice(1).map(r => [cellIn_(r[1])]));
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, 2).setValues(appends);
  return readKeyValues_(name);
}

function saveRecord_(name, record) {
  if (!record || typeof record !== 'object') throw apiError_('Missing record.', 'BAD_REQUEST');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id');
  if (idCol < 0) throw apiError_('The "' + name + '" tab needs an "id" column.', 'NOT_CONFIGURED');
  const allowed = SCHEMA[name];

  let id = String(record.id || '').trim();
  const rowIndex = id ? values.findIndex((r, i) => i > 0 && String(r[idCol]).trim() === id) : -1;
  if (!id) id = newId_(name);
  const existing = rowIndex > 0 ? values[rowIndex] : null;

  const row = head.map((h, i) => {
    if (h === 'id') return id;
    if (allowed.indexOf(h) === -1 || !(h in record)) return existing ? cellIn_(existing[i]) : '';
    if (BOOLEAN_COLUMNS.indexOf(h) >= 0) return isTrue_(record[h]);
    return cellIn_(record[h]);
  });

  const rowNumber = existing ? rowIndex + 1 : sh.getLastRow() + 1;
  if (!existing) {
    // Add tick boxes first: insertCheckboxes() resets cells to FALSE.
    BOOLEAN_COLUMNS.forEach(c => { const i = head.indexOf(c); if (i >= 0) sh.getRange(rowNumber, i + 1).insertCheckboxes(); });
  }
  sh.getRange(rowNumber, 1, 1, row.length).setValues([row]);

  const written = sh.getRange(rowNumber, 1, 1, head.length).getValues()[0];
  const saved = {};
  head.forEach((h, i) => { if (h) saved[h] = cellOut_(written[i]); });
  return saved;
}

function deleteRecord_(name, id) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const idCol = headers_(values).indexOf('id');
  const i = idCol < 0 ? -1 : values.findIndex((r, n) => n > 0 && String(r[idCol]).trim() === String(id).trim());
  if (i < 1) throw apiError_('That item no longer exists. Refresh and try again.', 'NOT_FOUND');
  sh.deleteRow(i + 1);
  return { deleted: String(id) };
}

function reorder_(name, ids) {
  if (!Array.isArray(ids) || !ids.length) throw apiError_('Nothing to reorder.', 'BAD_REQUEST');
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id'), orderCol = head.indexOf('display_order');
  if (idCol < 0 || orderCol < 0) throw apiError_('The "' + name + '" tab has no display_order column.', 'BAD_REQUEST');
  if (values.length < 2) return { reordered: 0 };
  const position = {};
  ids.forEach((id, i) => { position[String(id)] = i + 1; });
  const column = values.slice(1).map(r => [position[String(r[idCol]).trim()] || r[orderCol]]);
  sh.getRange(2, orderCol + 1, column.length, 1).setValues(column);
  return { reordered: ids.length };
}

function updateLeadStatus_(id, status) {
  if (LEAD_STATUSES.indexOf(status) < 0) throw apiError_('Status must be New, Contacted or Closed.', 'BAD_REQUEST');
  const sh = sheet_('Leads');
  const values = sh.getDataRange().getValues();
  const head = headers_(values);
  const idCol = head.indexOf('id'), statusCol = head.indexOf('status');
  const i = values.findIndex((r, n) => n > 0 && String(r[idCol]).trim() === String(id).trim());
  if (i < 1 || statusCol < 0) throw apiError_('Enquiry not found. Refresh and try again.', 'NOT_FOUND');
  sh.getRange(i + 1, statusCol + 1).setValue(status);
  return { id: String(id), status: status };
}

function appendObject_(name, obj) {
  const sh = sheet_(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  sh.appendRow(head.map(h => (h in obj ? cellIn_(obj[h]) : '')));
}

/* =================================== enquiries =================================== */

function submitEnquiry_(q) {
  if (q.website) return { received: true };   // honeypot filled in: quietly ignore bots
  const name = String(q.name || '').trim().slice(0, 80);
  const phone = String(q.phone || '').trim().slice(0, 20);
  const message = String(q.message || '').trim().slice(0, 1000);
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) throw apiError_('Enter your name.', 'VALIDATION');
  if (digits.length < 10 || digits.length > 13) throw apiError_('Enter a valid phone number.', 'VALIDATION');

  const cache = CacheService.getScriptCache();
  if (cache.get('enq_' + digits)) throw apiError_('An enquiry from this number arrived a few minutes ago. The gym will be in touch.', 'DUPLICATE');
  const hourKey = 'enq_hour_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
  const count = Number(cache.get(hourKey) || 0);
  if (count >= 30) throw apiError_('Too many enquiries right now. Please call or WhatsApp the gym instead.', 'RATE_LIMITED');

  write_(() => appendObject_('Leads', { id: newId_('Leads'), name: name, phone: phone, message: message, date: new Date(), status: 'New' }));
  cache.put('enq_' + digits, '1', 600);
  cache.put(hourKey, String(count + 1), 3600);
  notifyOwner_(name, phone, message);
  return { received: true };
}

function notifyOwner_(name, phone, message) {
  const to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;
  try {
    MailApp.sendEmail(to, 'New SSV Gym enquiry from ' + name,
      'Name: ' + name + '\nPhone: ' + phone + '\n\nMessage:\n' + (message || '(none)') + '\n\nManage enquiries in the admin panel.');
  } catch (err) { console.warn('Could not send the notification email: ' + err); }
}

/* ================================ authentication ================================ */

function login_(password) {
  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get('login_failures') || 0);
  if (failures >= MAX_LOGIN_FAILURES) throw apiError_('Too many incorrect attempts. Sign-in is locked for 15 minutes.', 'LOCKED');
  const props = PropertiesService.getScriptProperties();
  const hash = props.getProperty('ADMIN_PASSWORD_HASH'), salt = props.getProperty('ADMIN_PASSWORD_SALT');
  if (!hash || !salt) throw apiError_('No admin password is set yet. In the Google Sheet, use SSV Admin > Set admin password.', 'NOT_CONFIGURED');
  if (!password || sha256Hex_(salt + String(password)) !== hash) {
    cache.put('login_failures', String(failures + 1), LOCK_SECONDS);
    Utilities.sleep(700);
    throw apiError_('Incorrect password.', 'AUTH_FAILED');
  }
  cache.remove('login_failures');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('sess_' + token, sessionEpoch_(), SESSION_SECONDS);
  return { token: token, expiresIn: SESSION_SECONDS };
}

function requireSession_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) throw apiError_('Please sign in.', 'AUTH_REQUIRED');
  const cache = CacheService.getScriptCache();
  const epoch = sessionEpoch_();
  if (cache.get('sess_' + token) !== epoch) throw apiError_('Your session has expired. Please sign in again.', 'AUTH_REQUIRED');
  cache.put('sess_' + token, epoch, SESSION_SECONDS);
}

/** Changing SESSION_EPOCH signs out every existing session. */
function sessionEpoch_() { return PropertiesService.getScriptProperties().getProperty('SESSION_EPOCH') || '1'; }

/* ============================ Cloudinary (signed uploads) ============================ */

function cloudName_() {
  const cfg = readKeyValues_('Config') || {};
  const name = String(cfg.CLOUDINARY_CLOUD_NAME || PropertiesService.getScriptProperties().getProperty('CLOUDINARY_CLOUD_NAME') || '').trim();
  return /^YOUR_/i.test(name) ? '' : name;
}

function cloudinaryConfigured_() {
  const p = PropertiesService.getScriptProperties();
  return Boolean(p.getProperty('CLOUDINARY_API_KEY') && p.getProperty('CLOUDINARY_API_SECRET') && cloudName_());
}

/** Signs one upload. The API secret never leaves Apps Script. */
function getUploadSignature_() {
  const p = PropertiesService.getScriptProperties();
  const apiKey = p.getProperty('CLOUDINARY_API_KEY'), secret = p.getProperty('CLOUDINARY_API_SECRET'), cloud = cloudName_();
  if (!apiKey || !secret || !cloud) throw apiError_('Image uploads are not set up. Add CLOUDINARY_CLOUD_NAME to the Config tab and the API key and secret to Script Properties.', 'NOT_CONFIGURED');
  const cfg = readKeyValues_('Config') || {};
  const folder = String(cfg.CLOUDINARY_FOLDER || 'ssv-gym').replace(/[^\w\-\/]/g, '') || 'ssv-gym';
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = 'folder=' + folder + '&timestamp=' + timestamp;
  const signature = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, toSign + secret, Utilities.Charset.UTF_8));
  return { cloudName: cloud, apiKey: apiKey, timestamp: timestamp, folder: folder, signature: signature };
}

/* ============================ sheet menu & one-time setup ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SSV Admin')
    .addItem('Set up / repair sheets', 'setupSheets')
    .addItem('Set admin password', 'setAdminPassword')
    .addSeparator()
    .addItem('Clear website cache', 'clearWebsiteCache')
    .addItem('Sign out all admin sessions', 'signOutAllSessions')
    .addToUi();
}

/** Direct edits in the sheet show on the website straight away (after the visitor's short browser cache). */
function onEdit() {
  try { CacheService.getScriptCache().remove(CONTENT_CACHE_KEY); } catch (err) { /* ignore */ }
}

function setupSheets() {
  const ss = ss_();
  Object.keys(SCHEMA).forEach(name => {
    const cols = SCHEMA[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#151917').setFontColor('#8FE05A');
      sh.setFrozenRows(1);
      const seed = SEED[name] || [];
      if (seed.length) {
        BOOLEAN_COLUMNS.forEach(c => { const i = cols.indexOf(c); if (i >= 0) sh.getRange(2, i + 1, seed.length, 1).insertCheckboxes(); });
        sh.getRange(2, 1, seed.length, cols.length).setValues(seed.map(r => r.map(cellIn_)));
      }
    } else {
      const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(h => String(h).trim());
      cols.filter(c => head.indexOf(c) < 0).forEach(c => sh.getRange(1, sh.getLastColumn() + 1).setValue(c).setFontWeight('bold'));
    }
  });
  const leads = ss.getSheetByName('Leads');
  const statusCol = headers_(leads.getRange(1, 1, 1, leads.getLastColumn()).getValues()).indexOf('status') + 1;
  if (statusCol > 0) {
    leads.getRange(2, statusCol, Math.max(leads.getMaxRows() - 1, 1), 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(LEAD_STATUSES, true).setAllowInvalid(false).build());
  }
  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  toast_('Sheets are ready. Next: SSV Admin > Set admin password.');
}

function setAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Set admin password', 'Choose a password for admin.html (at least 10 characters). Anyone with this password can edit the website.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const password = res.getResponseText();
  if (password.length < 10) { ui.alert('Use at least 10 characters. The password was not changed.'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_PASSWORD_SALT: salt,
    ADMIN_PASSWORD_HASH: sha256Hex_(salt + password),
    SESSION_EPOCH: String(Date.now())
  });
  ui.alert('Admin password saved. Anyone signed in to the admin panel has been signed out.');
}

function clearWebsiteCache() {
  CacheService.getScriptCache().remove(CONTENT_CACHE_KEY);
  toast_('Website cache cleared.');
}

function signOutAllSessions() {
  PropertiesService.getScriptProperties().setProperty('SESSION_EPOCH', String(Date.now()));
  toast_('All admin sessions have been signed out.');
}

function toast_(message) { try { ss_().toast(message, 'SSV Admin', 8); } catch (err) { console.log(message); } }

/* ============================ sample rows (placeholders) ============================
   Written once by setupSheets() into empty tabs. Every value is a placeholder;
   replace them from the admin panel or directly in the sheet. */
const SAMPLE_FEATURES = 'Gym Access | Equipment Access | Trainer Assistance';
/** Unsplash stock photo (free licence): a stand-in until real SSV photos are uploaded. */
const STOCK = id => 'https://images.unsplash.com/' + id;
const SEED = {
  General: [
    ['gym_name', 'SSV Gym'],
    ['full_name', 'Shree Siddhi Vinayak Gym'],
    ['tagline', 'Train strong. Live strong.'],
    ['description', 'A fitness space for strength, conditioning and wellness.'],
    ['hero_heading', 'Train strong. | Live strong.'],
    ['hero_subtitle', 'A complete fitness space for strength, conditioning and wellness.'],
    ['hero_image', STOCK('photo-1623874514711-0f321325f318')],
    ['facility_strip', 'Main Gym | CrossFit | Steam Room'],
    ['about_heading', 'Shree Siddhi Vinayak Gym'],
    ['about_text', 'SSV Gym is a fitness space focused on strength training, conditioning and overall fitness. | Train on the main gym floor, build conditioning in the CrossFit and functional training area, and recover in the steam room.'],
    ['about_image', STOCK('photo-1534438327276-14e5300c3a48')],
    ['about_highlights', 'Quality Equipment | Dedicated Training Areas | Trainer Support | Fitness-focused Environment'],
    ['facilities_intro', 'The main gym floor, a CrossFit and functional training zone, and a steam room for recovery.'],
    ['stat_1_value', '10+'], ['stat_1_label', 'Years of Fitness'],
    ['stat_2_value', '20+'], ['stat_2_label', 'Training Machines'],
    ['stat_3_value', '500+'], ['stat_3_label', 'Members'],
    ['stat_4_value', '2'], ['stat_4_label', 'Training Zones'],
    ['phone', '+91 00000 00000'],
    ['whatsapp', '+91 00000 00000'],
    ['address', 'Shop No. 1, Sample Complex, Main Road | City, State 000000'],
    ['opening_hours', 'Mon – Sat: 6:00 AM – 10:00 PM | Sunday: 7:00 AM – 12:00 PM'],
    ['maps_url', 'https://www.google.com/maps/search/?api=1&query=Shree+Siddhi+Vinayak+Gym'],
    ['maps_embed_url', ''],
    ['instagram_url', 'https://www.instagram.com/'],
    ['featured_badge_text', 'Best value'],
    ['sample_content', true]
  ],
  Facilities: [
    ['fac-main', 'Main Gym', 'Strength | Cardio | Equipment', 'The main training floor for strength work, cardio and machine training.', STOCK('photo-1637430308606-86576d8fef3c'), 'major', true, 1],
    ['fac-crossfit', 'CrossFit', 'Functional Training | Conditioning', 'A dedicated area for functional movements, circuits and conditioning.', STOCK('photo-1536922246289-88c42f957773'), 'major', true, 2],
    ['fac-steam', 'Steam Room', 'Recovery | Relaxation', 'Unwind after training and support recovery in the steam room.', STOCK('photo-1759216852954-88e547b8e01f'), 'major', true, 3],
    ['fac-cardio', 'Cardio Area', '', 'Treadmills, bikes and cross-trainers for warm-ups and endurance work.', '', 'additional', true, 4],
    ['fac-weights', 'Free Weights', '', 'Dumbbells, barbells and benches for free-weight training.', '', 'additional', true, 5],
    ['fac-machines', 'Strength Machines', '', 'Machines for training every major muscle group.', '', 'additional', true, 6]
  ],
  Plans: [
    ['plan-monthly', 'Monthly', '1 Month', 1200, 'Flexible month-to-month access.', SAMPLE_FEATURES, false, true, 1],
    ['plan-quarterly', 'Quarterly', '3 Months', 3000, 'Three months to build a steady routine.', SAMPLE_FEATURES, false, true, 2],
    ['plan-half-yearly', 'Half Yearly', '6 Months', 5500, 'Six months of consistent training.', SAMPLE_FEATURES, false, true, 3],
    ['plan-yearly', 'Yearly', '12 Months', 9000, 'The lowest monthly cost, for committed members.', SAMPLE_FEATURES, true, true, 4]
  ],
  Trainers: [
    ['tr-1', 'Aman Verma', 'Fitness Trainer', 'General fitness and fat loss', 'Helps new members build a routine with sound technique and steady progress.', STOCK('photo-1577221084712-45b0445d2b00'), true, 1],
    ['tr-2', 'Neha Kulkarni', 'CrossFit Coach', 'Functional training and conditioning', 'Runs circuit and conditioning sessions in the CrossFit area.', STOCK('photo-1541534741688-6078c6bfb5c5'), true, 2],
    ['tr-3', 'Vikram Singh', 'Strength Trainer', 'Strength training and barbell basics', 'Coaches the main lifts with a focus on form and safe progression.', STOCK('photo-1517838277536-f5f99be501cd'), true, 3]
  ],
  Gallery: [
    ['img-1', STOCK('photo-1728486145245-d4cb0c9c3470'), 'Main gym floor', 'gym', 'Machines and free weights on the main floor.', true, 1],
    ['img-2', STOCK('photo-1548690312-e3b507d8c110'), 'Battle ropes', 'crossfit', 'Conditioning work in the CrossFit area.', true, 2],
    ['img-3', STOCK('photo-1571902943202-507ec2618e8f'), 'Strength machines', 'equipment', 'Machines for full-body training.', true, 3],
    ['img-4', STOCK('photo-1517836357463-d25dfeac3438'), 'Barbell session', 'training', 'Setting up for a heavy lift.', true, 4],
    ['img-5', STOCK('photo-1576678927484-cc907957088c'), 'Dumbbell rack', 'equipment', 'Dumbbells for every level.', true, 5],
    ['img-6', STOCK('photo-1601422407692-ec4eeec1d9b3'), 'Kettlebell work', 'crossfit', 'Functional movement with kettlebells.', true, 6],
    ['img-7', STOCK('photo-1689877020200-403d8542d95d'), 'Weights area', 'gym', 'Racks, benches and plates.', true, 7],
    ['img-8', STOCK('photo-1526506118085-60ce8714f8c5'), 'Focused training', 'training', 'Hard work on the gym floor.', true, 8],
    ['img-9', STOCK('photo-1759216852954-88e547b8e01f'), 'Steam room', 'gym', 'Recovery after training.', true, 9],
    ['img-10', STOCK('photo-1593079831268-3381b0db4a77'), 'Member event', 'events', 'Decorated for a gym celebration.', true, 10],
    ['img-11', STOCK('photo-1590487988256-9ed24133863e'), 'Equipment detail', 'equipment', 'Close-up of the training equipment.', true, 11],
    ['img-12', STOCK('photo-1605296867304-46d5465a13f1'), 'Lifting practice', 'training', 'Barbell work in the training area.', true, 12]
  ],
  Testimonials: [
    ['rev-1', 'Rohit P.', 'Well-maintained equipment and a serious training atmosphere. The trainers check your form without being asked.', 5, '', true, 1],
    ['rev-2', 'Sneha D.', 'The CrossFit area is my favourite part of the gym. Sessions are tough but well planned.', 5, '', true, 2],
    ['rev-3', 'Karan M.', 'Clean, bright and easy to train in, even in the mornings. The steam room after a workout is a bonus.', 4, '', true, 3]
  ],
  Announcements: [
    ['ann-1', 'Welcome to the new SSV Gym website', 'Membership details, timings and gym updates will be posted here.', new Date(), '', true, 1]
  ],
  Config: [
    ['GOOGLE_SHEET_ID', 'YOUR_GOOGLE_SHEET_ID'],
    ['APPS_SCRIPT_URL', 'YOUR_APPS_SCRIPT_URL'],
    ['CLOUDINARY_CLOUD_NAME', 'YOUR_CLOUDINARY_CLOUD_NAME'],
    ['CLOUDINARY_UPLOAD_PRESET', 'YOUR_CLOUDINARY_UPLOAD_PRESET'],
    ['CLOUDINARY_FOLDER', 'ssv-gym'],
    ['WHATSAPP_NUMBER', ''],
    ['GOOGLE_MAPS_URL', ''],
    ['INSTAGRAM_URL', '']
  ]
};
