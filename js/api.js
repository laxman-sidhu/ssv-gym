/* ==========================================================================
   SSV GYM — API SERVICE LAYER
   All communication with the Google Apps Script backend and Cloudinary goes
   through this file. The public site only reads. Write operations need an
   admin session token that the backend issues after checking the password.
   ========================================================================== */
const API = (() => {
  const CONTENT_KEY = 'ssv_content_v1';
  const TOKEN_KEY = 'ssv_admin_token';
  const COLLECTIONS = ['facilities', 'plans', 'trainers', 'gallery', 'testimonials', 'announcements'];
  let memo = null;

  class ApiError extends Error {
    constructor(message, code = 'ERROR') { super(message); this.name = 'ApiError'; this.code = code; }
  }

  const isPlaceholder = v => !v || /^YOUR_/i.test(String(v).trim());
  const isConfigured = () => !isPlaceholder(CONFIG.API_URL);

  /* ---------- admin session token (kept for this browser tab only) ---------- */
  const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = token => {
    try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  };

  /* ---------- low-level request ---------- */
  async function request(method, action, payload = {}) {
    if (!isConfigured()) throw new ApiError('API_URL is not set in js/config.js.', 'NOT_CONFIGURED');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.REQUEST_TIMEOUT_MS || 10000);
    try {
      const res = method === 'GET'
        ? await fetch(`${CONFIG.API_URL}?${new URLSearchParams({ action, ...payload })}`, { signal: ctrl.signal })
        // text/plain keeps this a "simple" CORS request (no preflight), which Apps Script needs.
        : await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, token: getToken(), ...payload }),
            signal: ctrl.signal
          });
      if (!res.ok) throw new ApiError(`Server responded with ${res.status}.`, `HTTP_${res.status}`);
      const json = await res.json().catch(() => { throw new ApiError('Unexpected response from the server.', 'BAD_RESPONSE'); });
      if (!json.ok) throw new ApiError(json.error || 'Request failed.', json.code || 'ERROR');
      return json.data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err.name === 'AbortError') throw new ApiError('The server took too long to respond.', 'TIMEOUT');
      throw new ApiError('Could not reach the server. Check the connection and API_URL.', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- public content: cache, then live, then saved copy, then sample ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CONTENT_KEY)); } catch { return null; } };
  const writeCache = data => { try { localStorage.setItem(CONTENT_KEY, JSON.stringify({ t: Date.now(), data })); } catch { /* quota / private mode */ } };
  function clearCache() { memo = null; try { localStorage.removeItem(CONTENT_KEY); } catch { /* ignore */ } }

  /* Live values always win. A collection missing from the response (for example
     a tab that doesn't exist yet) falls back to sample data and is listed in
     `sampleSections`. An EMPTY collection is respected: that section hides. */
  function merge(live, source) {
    const fb = clone(FALLBACK_DATA);
    const out = { source, sampleSections: [], general: { ...fb.general, ...(live.general || {}) } };
    COLLECTIONS.forEach(key => {
      if (Array.isArray(live[key])) out[key] = live[key];
      else { out[key] = fb[key]; out.sampleSections.push(key); }
    });
    // General > sample_content keeps the "sample content" notice on while dummy details are live.
    out.isSample = source === 'fallback' || out.sampleSections.length > 0 || Utils.truthy(out.general.sample_content);
    return out;
  }

  async function getContent({ force = false } = {}) {
    if (memo && !force) return memo;
    const cached = readCache();
    const ttl = (CONFIG.CACHE_MINUTES ?? 5) * 60000;
    if (!force && cached && cached.data && Date.now() - cached.t < ttl) return (memo = merge(cached.data, 'cache'));
    try {
      const data = await request('GET', 'content');
      writeCache(data);
      return (memo = merge(data, 'live'));
    } catch (err) {
      if (cached && cached.data) {
        console.warn('[SSV] API unavailable, showing the last saved content.', err.message);
        return (memo = merge(cached.data, 'stale'));
      }
      console.info(`%c[SSV] Showing SAMPLE fallback data from js/data.js (${err.code}).`, 'color:#8FE05A;font-weight:bold');
      return (memo = merge({}, 'fallback'));
    }
  }
  const pick = key => async () => (await getContent())[key];

  /* ---------- Cloudinary upload (admin) ---------- */
  async function uploadImage(file, onProgress) {
    if (!file || !/^image\//.test(file.type)) throw new ApiError('Choose an image file (JPG, PNG or WebP).', 'INVALID_FILE');
    const maxMb = CONFIG.MAX_UPLOAD_MB || 10;
    if (file.size > maxMb * 1048576) throw new ApiError(`This image is larger than ${maxMb} MB. Resize it and try again.`, 'FILE_TOO_LARGE');

    const form = new FormData();
    form.append('file', file);
    let cloud;
    if (CONFIG.CLOUDINARY_UPLOAD_MODE === 'unsigned') {
      if (isPlaceholder(CONFIG.CLOUDINARY_CLOUD_NAME) || isPlaceholder(CONFIG.CLOUDINARY_UPLOAD_PRESET)) {
        throw new ApiError('Set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in js/config.js.', 'NOT_CONFIGURED');
      }
      cloud = CONFIG.CLOUDINARY_CLOUD_NAME;
      form.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);
      if (CONFIG.CLOUDINARY_FOLDER) form.append('folder', CONFIG.CLOUDINARY_FOLDER);
    } else {
      const sig = await request('POST', 'getUploadSignature'); // backend keeps the API secret
      cloud = sig.cloudName;
      form.append('api_key', sig.apiKey);
      form.append('timestamp', sig.timestamp);
      form.append('signature', sig.signature);
      form.append('folder', sig.folder);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let r = {};
        try { r = JSON.parse(xhr.responseText); } catch { /* keep empty */ }
        if (xhr.status >= 200 && xhr.status < 300 && r.secure_url) resolve({ url: r.secure_url, publicId: r.public_id, width: r.width, height: r.height });
        else reject(new ApiError((r.error && r.error.message) || 'Upload failed.', 'UPLOAD_FAILED'));
      };
      xhr.onerror = () => reject(new ApiError('Upload failed because of a network error.', 'NETWORK'));
      xhr.send(form);
    });
  }

  const saveRecord = (collection, record) => request('POST', 'saveRecord', { collection, record });

  return {
    ApiError, isConfigured, getToken, setToken, clearCache,
    cloudinaryMode: () => (CONFIG.CLOUDINARY_UPLOAD_MODE === 'unsigned' ? 'unsigned' : 'signed'),

    /* public reads (one request, cached) */
    getContent,
    getGeneralData: pick('general'),
    getFacilities: pick('facilities'),
    getPlans: pick('plans'),
    getTrainers: pick('trainers'),
    getGallery: pick('gallery'),
    getTestimonials: pick('testimonials'),
    getAnnouncements: pick('announcements'),
    health: () => request('GET', 'health'),

    /* public write */
    submitEnquiry: enquiry => request('POST', 'submitEnquiry', { enquiry }),

    /* admin: every call below is re-checked by the backend */
    login: async password => { const d = await request('POST', 'login', { password }); setToken(d.token); return d; },
    logout: async () => { try { await request('POST', 'logout'); } catch { /* already expired */ } finally { setToken(null); } },
    verifySession: () => request('POST', 'verify'),
    getAdminData: () => request('POST', 'adminGetAll'),
    getEnquiries: () => request('POST', 'getEnquiries'),
    updateEnquiryStatus: (id, status) => request('POST', 'updateLeadStatus', { id, status }),
    saveGeneralData: general => request('POST', 'saveGeneral', { general }),
    saveRecord,
    deleteRecord: (collection, id) => request('POST', 'deleteRecord', { collection, id }),
    reorder: (collection, ids) => request('POST', 'reorder', { collection, ids }),
    saveFacility: r => saveRecord('facilities', r),
    savePlan: r => saveRecord('plans', r),
    saveTrainer: r => saveRecord('trainers', r),
    saveGalleryItem: r => saveRecord('gallery', r),
    saveTestimonial: r => saveRecord('testimonials', r),
    saveAnnouncement: r => saveRecord('announcements', r),
    uploadImage
  };
})();
