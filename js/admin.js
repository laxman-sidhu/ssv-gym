/* ==========================================================================
   SSV GYM — ADMIN PANEL (admin.html)
   --------------------------------------------------------------------------
   Security model: this page holds NO credentials. Sign-in sends the password
   to the Apps Script backend, which checks it against a salted hash kept in
   Script Properties and returns a short-lived session token. Every write is
   checked again on the server. Keeping admin.html out of the menu is only
   tidiness; it is not what protects the site.

   Demo mode (when API_URL is not set) uses the sample data in js/data.js and
   keeps changes in this tab only. It has no access to real data.
   ========================================================================== */
(() => {
  'use strict';

  const { esc, truthy, splitList, formatPrice, formatDate, toDate, intlPhone, isPlaceholder, isDummyPhone, safeUrl, cld, pad2, byOrder } = Utils;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const truncate = (s, n) => { const t = String(s || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const isExpired = r => { const d = toDate(r.expiry); const t = new Date(); t.setHours(0, 0, 0, 0); return Boolean(d && d < t); };
  const fmtDateTime = v => { const [d, t] = String(v || '').split(' '); return d ? formatDate(d) + (t ? `, ${t}` : '') : '—'; };

  const GALLERY_CATS = [['gym', 'Gym'], ['crossfit', 'CrossFit'], ['training', 'Training'], ['equipment', 'Equipment'], ['events', 'Events']];
  const LEAD_STATUSES = ['New', 'Contacted', 'Closed'];
  const ACTIVE = { key: 'active', label: 'Show on website', type: 'checkbox', default: true };

  /* ----------------------------------------------------- content schemas */
  const COLLECTIONS = {
    facilities: {
      singular: 'facility', plural: 'facilities', image: 'image_url',
      heads: ['Facility', 'Shown as', 'Tags'],
      cells: r => [r.name, String(r.category).toLowerCase() === 'additional' ? 'Small list item' : 'Large card', splitList(r.tags).join(' • ') || '—'],
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'category', label: 'Shown as', type: 'select', default: 'major', options: [['major', 'Large card (main areas)'], ['additional', 'Small list item (other facilities)']] },
        { key: 'tags', label: 'Tags', full: true, hint: 'Separate with |, e.g. Strength | Cardio | Equipment' },
        { key: 'description', label: 'Short description', type: 'textarea' },
        { key: 'image_url', label: 'Photo', type: 'image' },
        ACTIVE
      ]
    },
    plans: {
      singular: 'plan', plural: 'plans',
      heads: ['Plan', 'Duration', 'Price', 'Highlighted'],
      cells: r => [r.name, r.duration, formatPrice(r.price), truthy(r.featured) ? 'Yes' : '—'],
      fields: [
        { key: 'name', label: 'Plan name', required: true },
        { key: 'duration', label: 'Duration', required: true, hint: 'e.g. 1 Month, 3 Months' },
        { key: 'price', label: 'Price (₹)', full: true, hint: 'Numbers only, e.g. 1200 shows as ₹1,200. Text such as "Ask at the desk" also works.' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'features', label: 'Features', type: 'textarea', list: true, hint: 'One per line' },
        { key: 'featured', label: 'Highlight this plan', type: 'checkbox', default: false },
        ACTIVE
      ]
    },
    trainers: {
      singular: 'trainer', plural: 'trainers', image: 'image_url',
      heads: ['Trainer', 'Role', 'Specialization'],
      cells: r => [r.name, r.role || '—', r.specialization || '—'],
      fields: [
        { key: 'name', label: 'Name', required: true },
        { key: 'role', label: 'Role', hint: 'e.g. Fitness Trainer, CrossFit Coach' },
        { key: 'specialization', label: 'Specialization', full: true },
        { key: 'bio', label: 'Short bio', type: 'textarea', hint: 'Only include qualifications the trainer actually holds.' },
        { key: 'image_url', label: 'Photo', type: 'image' },
        ACTIVE
      ]
    },
    gallery: {
      singular: 'image', plural: 'images', image: 'image_url',
      fields: [
        { key: 'image_url', label: 'Image', type: 'image', required: true },
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category', type: 'select', default: 'gym', options: GALLERY_CATS },
        { key: 'caption', label: 'Caption', type: 'textarea', rows: 2 },
        ACTIVE
      ]
    },
    testimonials: {
      singular: 'testimonial', plural: 'testimonials', image: 'image_url',
      note: "Only publish genuine reviews, shared with the member's permission.",
      heads: ['Member', 'Rating', 'Review'],
      cells: r => [r.name, r.rating ? `${r.rating} / 5` : '—', truncate(r.review, 90)],
      fields: [
        { key: 'name', label: 'Member name', required: true },
        { key: 'rating', label: 'Rating', type: 'select', default: '5', options: [['5', '5 stars'], ['4', '4 stars'], ['3', '3 stars'], ['2', '2 stars'], ['1', '1 star'], ['', 'No rating']] },
        { key: 'review', label: 'Review', type: 'textarea', rows: 4, required: true },
        { key: 'image_url', label: 'Photo (optional)', type: 'image' },
        ACTIVE
      ]
    },
    announcements: {
      singular: 'announcement', plural: 'announcements', ordered: false,
      note: 'The announcement area hides itself when nothing is shown. Expired announcements hide automatically.',
      heads: ['Title', 'Date', 'Expires', 'Priority'],
      cells: r => [r.title, r.date ? formatDate(r.date) : '—', r.expiry ? formatDate(r.expiry) : 'Never', r.priority ?? '—'],
      fields: [
        { key: 'title', label: 'Title', required: true, full: true },
        { key: 'description', label: 'Details', type: 'textarea' },
        { key: 'date', label: 'Date', type: 'date', default: today },
        { key: 'expiry', label: 'Expires on', type: 'date', hint: 'Leave empty to show until you hide it.' },
        { key: 'priority', label: 'Priority', type: 'number', default: 1, hint: 'Higher numbers show first.' },
        ACTIVE
      ]
    }
  };

  const GENERAL = [
    ['Name & description', null, [
      { key: 'gym_name', label: 'Gym name (short)', hint: 'e.g. SSV Gym' },
      { key: 'full_name', label: 'Full gym name' },
      { key: 'tagline', label: 'Tagline', hint: 'Shown in the footer.' },
      { key: 'description', label: 'Short description', hint: 'Summary used for search results.' }
    ]],
    ['Hero (top of the page)', null, [
      { key: 'hero_heading', label: 'Heading', full: true, hint: 'Use | to start a new line, e.g. Train strong. | Live strong.' },
      { key: 'hero_subtitle', label: 'Subtitle', type: 'textarea', rows: 2 },
      { key: 'hero_image', label: 'Hero photo', type: 'image', hint: 'Landscape, at least 2000 px wide.' },
      { key: 'facility_strip', label: 'Facility strip', full: true, hint: 'Separate with |, e.g. Main Gym | CrossFit | Steam Room' }
    ]],
    ['About & facilities text', null, [
      { key: 'about_heading', label: 'About heading', full: true },
      { key: 'about_text', label: 'About text', type: 'textarea', rows: 5, list: true, hint: 'One paragraph per line.' },
      { key: 'about_image', label: 'About photo', type: 'image' },
      { key: 'about_highlights', label: 'Highlights', type: 'textarea', rows: 4, list: true, hint: 'One per line.' },
      { key: 'facilities_intro', label: 'Facilities introduction', type: 'textarea', rows: 2 }
    ]],
    ['Statistics', 'Leave a value empty to hide that statistic. Only publish figures you can stand behind.',
      [1, 2, 3, 4].flatMap(n => [
        { key: `stat_${n}_value`, label: `Statistic ${n}: value`, hint: n === 1 ? 'e.g. 10+' : '' },
        { key: `stat_${n}_label`, label: `Statistic ${n}: label`, hint: n === 1 ? 'e.g. Years of Fitness' : '' }
      ])],
    ['Contact details', null, [
      { key: 'phone', label: 'Phone number', type: 'tel' },
      { key: 'whatsapp', label: 'WhatsApp number', type: 'tel', hint: 'Include the country code, e.g. +91 98xxx xxxxx' },
      { key: 'address', label: 'Address', type: 'textarea', rows: 3, list: true, hint: 'One line per address line.' },
      { key: 'opening_hours', label: 'Opening hours', type: 'textarea', rows: 3, list: true, hint: 'One line per day range, e.g. Mon–Sat: 6 AM – 10 PM' },
      { key: 'maps_url', label: 'Google Maps link', type: 'url', full: true, hint: 'Google Maps > Share > Copy link' },
      { key: 'maps_embed_url', label: 'Map embed link (optional)', type: 'url', full: true, hint: 'Google Maps > Share > Embed a map > copy only the link inside src="…"' },
      { key: 'instagram_url', label: 'Instagram link', type: 'url', full: true }
    ]],
    ['Membership section', null, [
      { key: 'featured_badge_text', label: 'Label on the highlighted plan', hint: 'e.g. Best value' }
    ]],
    ['Sample content', 'While this is on, visitors see a small notice and "sample" tags saying the photos and details are placeholders. Turn it off once everything is real.', [
      { key: 'sample_content', label: 'Show the sample-content notice on the website', type: 'checkbox', default: false }
    ]]
  ];

  const S = { demo: false, data: null, leadFilter: 'all' };

  /* ------------------------------------------------------------- start-up */
  function boot() {
    bindChrome();
    if (!API.isConfigured()) {
      $('#login-form').hidden = true;
      $('#login-setup').hidden = false;
      showLogin();
      return;
    }
    if (API.getToken()) {
      API.verifySession().then(enterApp).catch(() => { API.setToken(null); showLogin(); });
      return;
    }
    showLogin();
  }

  function showLogin() {
    $('#app').hidden = true;
    $('#login-view').hidden = false;
    const pw = $('#login-form').elements.namedItem('password');
    if (!$('#login-form').hidden) pw.focus();
  }

  async function onLogin(e) {
    e.preventDefault();
    const form = e.currentTarget, btn = form.querySelector('[type="submit"]'), msg = $('#login-msg');
    const password = form.elements.namedItem('password').value;
    if (!password) { msg.textContent = 'Enter the admin password.'; return; }
    setBusy(btn, true, 'Signing in…');
    msg.textContent = '';
    try { await API.login(password); form.reset(); await enterApp(); }
    catch (err) { msg.textContent = err.message; }
    finally { setBusy(btn, false); }
  }

  async function enterApp() {
    $('#login-view').hidden = true;
    $('#app').hidden = false;
    $('#demo-banner').hidden = !S.demo;
    const conn = $('#conn-status');
    conn.textContent = S.demo ? 'Demo mode' : 'Connected to Google Sheets';
    conn.className = `conn ${S.demo ? 'is-demo' : 'is-live'}`;
    $('#refresh-btn').textContent = S.demo ? 'Reset demo data' : 'Refresh';
    await loadData();
    route();
  }

  async function loadData() {
    if (S.demo) { S.data = demoData(); return; }
    $('#view').innerHTML = '<p class="loading">Loading content from Google Sheets…</p>';
    try { S.data = normalize(await API.getAdminData()); }
    catch (err) { handleError(err); if (!S.data) S.data = normalize({}); }
  }

  function normalize(d) {
    ['facilities', 'plans', 'trainers', 'gallery', 'testimonials', 'announcements', 'leads'].forEach(k => { d[k] = Array.isArray(d[k]) ? d[k] : []; });
    d.general = d.general || {};
    d.config = d.config || {};
    d.meta = d.meta || {};
    return d;
  }

  function demoData() {
    const d = JSON.parse(JSON.stringify(FALLBACK_DATA));
    d.leads = [
      { id: 'lead-demo-1', name: 'Sample Enquiry', phone: '+91 XXXXX XXXXX', message: 'Sample message. Enquiries sent from the website form appear here.', date: `${today()} 10:30`, status: 'New' },
      { id: 'lead-demo-2', name: 'Sample Enquiry', phone: '+91 XXXXX XXXXX', message: 'Asked about the Quarterly plan.', date: `${today()} 09:15`, status: 'Contacted' },
      { id: 'lead-demo-3', name: 'Sample Enquiry', phone: '+91 XXXXX XXXXX', message: '', date: '2026-09-01 18:00', status: 'Closed' }
    ];
    d.meta = { version: 'demo', cloudinaryConfigured: false };
    return normalize(d);
  }

  /* --------------------------------------------------------------- routing */
  const VIEWS = {
    dashboard: ['Dashboard', renderDashboard],
    general: ['General information', renderGeneral],
    facilities: ['Facilities', () => renderCollection('facilities')],
    plans: ['Membership plans', () => renderCollection('plans')],
    trainers: ['Trainers', () => renderCollection('trainers')],
    gallery: ['Gallery', renderGallery],
    testimonials: ['Testimonials', () => renderCollection('testimonials')],
    announcements: ['Announcements', () => renderCollection('announcements')],
    enquiries: ['Enquiries', renderEnquiries],
    settings: ['Settings', renderSettings]
  };

  function route() {
    if (!S.data || $('#app').hidden) return;
    const hash = location.hash.slice(1);
    const key = VIEWS[hash] ? hash : 'dashboard';
    const [title, render] = VIEWS[key];
    $('#view-title').textContent = title;
    document.title = `${title} · SSV Admin`;
    $$('.sidebar__nav a').forEach(a => (a.dataset.view === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    render();
    updateBadge();
    setSidebar(false);
  }
  const view = html => { $('#view').innerHTML = html; };

  /* ------------------------------------------------------------- dashboard */
  function cloudinaryReady() {
    if (API.cloudinaryMode() === 'unsigned') return !isPlaceholder(CONFIG.CLOUDINARY_CLOUD_NAME) && !isPlaceholder(CONFIG.CLOUDINARY_UPLOAD_PRESET);
    return Boolean(S.data && S.data.meta && S.data.meta.cloudinaryConfigured);
  }

  function checklist() {
    const d = S.data, g = d.general;
    const shownSample = (key, test) => d[key].some(r => truthy(r.active) && test(r));
    const isStock = url => /images\.unsplash\.com/.test(String(url || ''));
    const usesStockPhotos = isStock(g.hero_image) || isStock(g.about_image) ||
      ['facilities', 'trainers', 'gallery', 'testimonials'].some(key => shownSample(key, r => isStock(r.image_url)));
    return [
      [API.isConfigured() && !S.demo, 'Website connected to Google Sheets (API_URL in js/config.js)'],
      [cloudinaryReady(), 'Image uploads set up (Cloudinary)'],
      [!isPlaceholder(g.phone) && !isDummyPhone(g.phone) && !isDummyPhone(g.whatsapp), 'Real phone and WhatsApp numbers added'],
      [!isPlaceholder(g.address) && !/sample/i.test(g.address) && !isPlaceholder(g.opening_hours), 'Real address and opening hours added'],
      [Boolean(safeUrl(g.maps_url)) && !/maps\/search/.test(g.maps_url), 'Google Maps link points to the gym'],
      [!usesStockPhotos, 'Stock photos replaced with real SSV photos'],
      [!shownSample('testimonials', r => /^rev-[123]$/.test(String(r.id))), 'Dummy testimonials replaced with genuine reviews or hidden'],
      [!truthy(g.sample_content), 'Prices, trainers and figures confirmed, sample notice turned off']
    ];
  }

  const leadItem = l => `<li>
    <div class="lead-list__row"><strong>${esc(l.name)}</strong><span class="status status--${esc(String(l.status || 'New').toLowerCase())}">${esc(l.status || 'New')}</span></div>
    <div class="lead-list__row"><span>${esc(l.phone)}</span><span>${esc(fmtDateTime(l.date))}</span></div>
    ${l.message ? `<p>${esc(truncate(l.message, 140))}</p>` : ''}
  </li>`;

  function renderDashboard() {
    const d = S.data;
    const active = key => d[key].filter(r => truthy(r.active)).length;
    const newLeads = d.leads.filter(l => (l.status || 'New') === 'New').length;
    const cards = [
      ['New enquiries', newLeads, '#enquiries', newLeads > 0],
      ['Active plans', active('plans'), '#plans'],
      ['Active trainers', active('trainers'), '#trainers'],
      ['Gallery images', d.gallery.length, '#gallery']
    ];
    const recent = [...d.leads].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
    view(`
      <div class="stat-cards">${cards.map(([label, n, href, alert]) => `<a class="stat-card${alert ? ' stat-card--alert' : ''}" href="${href}"><span class="stat-card__label">${label}</span><strong class="stat-card__value">${n}</strong></a>`).join('')}</div>
      <div class="dash-grid">
        <section class="panel">
          <header class="panel__head"><h2>Recent enquiries</h2><a href="#enquiries">View all</a></header>
          ${recent.length ? `<ul class="lead-list">${recent.map(leadItem).join('')}</ul>` : '<p class="panel__note">No enquiries yet. Messages from the website form will appear here.</p>'}
        </section>
        <section class="panel">
          <header class="panel__head"><h2>Before going live</h2></header>
          <ul class="checklist">${checklist().map(([done, text]) => `<li class="${done ? 'is-done' : ''}">${esc(text)}</li>`).join('')}</ul>
        </section>
      </div>`);
  }

  /* ---------------------------------------------------------------- forms */
  function fieldHtml(f, value) {
    let v = value;
    if (v === undefined || v === null) v = typeof f.default === 'function' ? f.default() : (f.default ?? '');
    if (f.list) v = splitList(v).join('\n');
    const hint = f.hint ? `<small class="field__hint">${esc(f.hint)}</small>` : '';
    const label = `<span class="field__label">${esc(f.label)}${f.required ? ' *' : ''}</span>`;
    const full = f.full || f.type === 'textarea' ? ' field--full' : '';
    switch (f.type) {
      case 'textarea':
        return `<label class="field${full}">${label}<textarea name="${f.key}" rows="${f.rows || 3}">${esc(v)}</textarea>${hint}</label>`;
      case 'checkbox':
        return `<label class="field field--check"><input type="checkbox" name="${f.key}"${truthy(v) ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
      case 'select':
        return `<label class="field${full}">${label}<select name="${f.key}">${f.options.map(([o, l]) => `<option value="${esc(o)}"${String(v).toLowerCase() === String(o).toLowerCase() ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</label>`;
      case 'image': {
        const u = safeUrl(v);
        return `<div class="field field--full" data-image-field>
          ${label}
          <div class="image-field__row">
            <div class="image-field__preview">${u ? `<img src="${esc(cld(u, 240))}" alt="">` : '<span>No image</span>'}</div>
            <div class="image-field__controls">
              <button type="button" class="btn btn--ghost btn--sm" data-upload>Upload image</button>
              <div class="progress" hidden><span></span></div>
              <input type="url" name="${f.key}" value="${esc(v)}" placeholder="Image link (filled in automatically after upload)">
              <small class="field__hint">${esc(f.hint || `JPG, PNG or WebP, up to ${CONFIG.MAX_UPLOAD_MB || 10} MB.`)}</small>
            </div>
          </div>
        </div>`;
      }
      default:
        return `<label class="field${full}">${label}<input type="${f.type || 'text'}" name="${f.key}" value="${esc(v)}"${f.type === 'number' ? ' step="1"' : ''}>${hint}</label>`;
    }
  }

  function collect(form, fields) {
    const out = {};
    fields.forEach(f => {
      const el = form.elements.namedItem(f.key);
      if (!el) return;
      if (f.type === 'checkbox') out[f.key] = el.checked;
      else if (f.list) out[f.key] = splitList(el.value).join(' | ');
      else if (f.type === 'number') out[f.key] = el.value === '' ? '' : Number(el.value);
      else out[f.key] = el.value.trim();
    });
    return out;
  }

  /* ----------------------------------------------------- general information */
  function renderGeneral() {
    const g = S.data.general;
    view(`<form class="stack" id="general-form" novalidate>
      ${GENERAL.map(([title, note, fields]) => `<section class="panel">
        <header class="panel__head"><h2>${esc(title)}</h2></header>
        ${note ? `<p class="panel__note panel__note--top">${esc(note)}</p>` : ''}
        <div class="form-grid">${fields.map(f => fieldHtml(f, g[f.key])).join('')}</div>
      </section>`).join('')}
      <div class="form-actions"><button type="submit" class="btn btn--primary">Save changes</button></div>
    </form>`);
    $('#general-form').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget, btn = form.querySelector('[type="submit"]');
      const values = collect(form, GENERAL.flatMap(([, , fields]) => fields));
      setBusy(btn, true, 'Saving…');
      try {
        if (!S.demo) { await API.saveGeneralData(values); API.clearCache(); }
        Object.assign(S.data.general, values);
        toast(S.demo ? 'Changes saved in demo mode (not sent to Google Sheets).' : 'Changes saved. Visitors see them within a few minutes.');
      } catch (err) { handleError(err); }
      finally { setBusy(btn, false); }
    });
  }

  /* ---------------------------------------------------- list-style content */
  function sortedRows(key) {
    const list = [...S.data[key]];
    if (key === 'announcements') return list.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)));
    return list.sort(byOrder);
  }
  const nextOrder = key => Math.max(0, ...S.data[key].map(r => Number(r.display_order) || 0)) + 1;

  function statusPill(key, r) {
    if (!truthy(r.active)) return '<span class="pill">Hidden</span>';
    if (key === 'announcements' && isExpired(r)) return '<span class="pill pill--warn">Expired</span>';
    return '<span class="pill pill--on">Shown</span>';
  }

  function renderCollection(key) {
    const c = COLLECTIONS[key], rows = sortedRows(key), ordered = c.ordered !== false;
    const shown = rows.filter(r => truthy(r.active)).length;
    view(`<div data-collection="${key}">
      <div class="toolbar">
        <p class="toolbar__info">${rows.length} ${rows.length === 1 ? c.singular : c.plural}, ${shown} shown on the website</p>
        <button type="button" class="btn btn--primary" data-add>Add ${c.singular}</button>
      </div>
      ${c.note ? `<p class="hint-box">${esc(c.note)}</p>` : ''}
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr>${ordered ? '<th class="col-order" scope="col">Order</th>' : ''}${c.heads.map(h => `<th scope="col">${esc(h)}</th>`).join('')}<th scope="col">Status</th><th class="col-actions" scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((r, i) => rowHtml(key, c, r, i, rows.length, ordered)).join('')}</tbody>
      </table></div>`
      : `<div class="empty"><p>No ${c.plural} yet.</p><button type="button" class="btn btn--ghost" data-add>Add the first ${c.singular}</button></div>`}
    </div>`);
  }

  function rowHtml(key, c, r, i, n, ordered) {
    const cells = c.cells(r), name = cells[0] || 'Untitled', photo = c.image ? safeUrl(r[c.image]) : '';
    const thumb = c.image ? `<span class="thumb">${photo ? `<img src="${esc(cld(photo, 120))}" alt="" loading="lazy">` : ''}</span>` : '';
    return `<tr class="${truthy(r.active) ? '' : 'is-muted'}" data-id="${esc(r.id)}">
      ${ordered ? `<td class="col-order"><button type="button" class="icon-btn" data-act="up" aria-label="Move ${esc(name)} up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="icon-btn" data-act="down" aria-label="Move ${esc(name)} down"${i === n - 1 ? ' disabled' : ''}>↓</button></td>` : ''}
      ${cells.map((v, j) => (j === 0 ? `<td><div class="cell-main">${thumb}<strong>${esc(name)}</strong></div></td>` : `<td>${esc(v)}</td>`)).join('')}
      <td>${statusPill(key, r)}</td>
      <td class="col-actions">
        <button type="button" class="btn btn--ghost btn--xs" data-act="edit" aria-label="Edit ${esc(name)}">Edit</button>
        <button type="button" class="btn btn--ghost btn--xs" data-act="toggle">${truthy(r.active) ? 'Hide' : 'Show'}</button>
        <button type="button" class="btn btn--danger btn--xs" data-act="delete" aria-label="Delete ${esc(name)}">Delete</button>
      </td>
    </tr>`;
  }

  function renderGallery() {
    const rows = sortedRows('gallery'), shown = rows.filter(r => truthy(r.active)).length;
    const catLabel = k => (GALLERY_CATS.find(([v]) => v === String(k || '').toLowerCase()) || [k, k || 'No category'])[1];
    view(`<div data-collection="gallery">
      <div class="toolbar">
        <p class="toolbar__info">${rows.length} ${rows.length === 1 ? 'image' : 'images'}, ${shown} shown on the website</p>
        <button type="button" class="btn btn--primary" data-upload-new>+ Upload image</button>
      </div>
      <p class="hint-box">Uploading sends the photo to Cloudinary and saves its link and details to the Gallery tab of the Google Sheet.</p>
      ${rows.length ? `<ul class="media-grid">${rows.map((r, i) => {
        const u = safeUrl(r.image_url), title = r.title || 'Untitled';
        return `<li class="media-card${truthy(r.active) ? '' : ' is-muted'}" data-id="${esc(r.id)}">
          <div class="media-card__img"><span>No image</span>${u ? `<img src="${esc(cld(u, 480))}" alt="${esc(title)}" loading="lazy">` : ''}<span class="pill media-card__cat">${esc(catLabel(r.category))}</span>${truthy(r.active) ? '' : '<span class="pill media-card__state">Hidden</span>'}</div>
          <div class="media-card__body"><strong>${esc(title)}</strong>${r.caption ? `<small>${esc(r.caption)}</small>` : ''}</div>
          <div class="media-card__actions">
            <button type="button" class="icon-btn" data-act="up" aria-label="Move ${esc(title)} earlier"${i === 0 ? ' disabled' : ''}>←</button>
            <button type="button" class="icon-btn" data-act="down" aria-label="Move ${esc(title)} later"${i === rows.length - 1 ? ' disabled' : ''}>→</button>
            <span class="spacer"></span>
            <button type="button" class="btn btn--ghost btn--xs" data-act="edit" aria-label="Edit ${esc(title)}">Edit</button>
            <button type="button" class="btn btn--ghost btn--xs" data-act="toggle">${truthy(r.active) ? 'Hide' : 'Show'}</button>
            <button type="button" class="btn btn--danger btn--xs" data-act="delete" aria-label="Delete ${esc(title)}">Delete</button>
          </div>
        </li>`;
      }).join('')}</ul>`
      : '<div class="empty"><p>No images yet.</p><button type="button" class="btn btn--ghost" data-upload-new>Upload the first image</button></div>'}
    </div>`);
  }

  function openEditor(key, rec = null, { pick = false } = {}) {
    const c = COLLECTIONS[key];
    openModal({
      title: rec ? `Edit ${c.singular}` : (key === 'gallery' ? 'Upload image' : `Add ${c.singular}`),
      submitLabel: rec ? 'Save changes' : (key === 'gallery' ? 'Add to gallery' : `Add ${c.singular}`),
      body: `${c.note ? `<p class="hint-box">${esc(c.note)}</p>` : ''}<div class="form-grid">${c.fields.map(f => fieldHtml(f, rec ? rec[f.key] : undefined)).join('')}</div>`,
      onSubmit: async form => {
        const values = collect(form, c.fields);
        const missing = c.fields.find(f => f.required && String(values[f.key] ?? '').trim() === '');
        if (missing) {
          toast(`${missing.label} is required.`, 'error');
          const el = form.elements.namedItem(missing.key);
          if (el) el.focus();
          return false;
        }
        const record = { ...(rec || {}), ...values };
        if (!rec && c.ordered !== false) record.display_order = nextOrder(key);
        return persist(key, record, rec ? 'Changes saved.' : (key === 'gallery' ? 'Image added to the gallery.' : `${cap(c.singular)} added.`));
      }
    });
    if (pick) { const wrap = $('#modal [data-image-field]'); if (wrap) pickAndUpload(wrap); }
  }

  async function persist(key, record, message) {
    try {
      let saved = record;
      if (S.demo) { if (!saved.id) saved = { ...saved, id: `${key.slice(0, 3)}-demo-${Date.now().toString(36)}` }; }
      else { saved = await API.saveRecord(key, record); API.clearCache(); }
      const list = S.data[key], i = list.findIndex(r => String(r.id) === String(saved.id));
      if (i >= 0) list[i] = saved; else list.push(saved);
      toast(S.demo ? `${message} (demo only, not saved)` : message);
      route();
      return true;
    } catch (err) { handleError(err); return false; }
  }

  async function removeRecord(key, rec) {
    try {
      if (!S.demo) { await API.deleteRecord(key, rec.id); API.clearCache(); }
      S.data[key] = S.data[key].filter(r => r !== rec);
      toast(S.demo ? 'Deleted (demo only).' : 'Deleted.');
      route();
    } catch (err) { handleError(err); }
  }

  async function move(key, rec, dir) {
    const rows = sortedRows(key), i = rows.indexOf(rec), j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    rows.forEach((r, n) => { r.display_order = n + 1; });
    route();
    if (S.demo) return;
    try { await API.reorder(key, rows.map(r => r.id)); API.clearCache(); }
    catch (err) { handleError(err); await loadData(); route(); }
  }

  /* ------------------------------------------------------------ image upload */
  function pickFile() {
    return new Promise(resolve => {
      const picker = $('#file-picker');
      picker.value = '';
      picker.onchange = () => resolve(picker.files[0] || null);
      picker.click();
    });
  }

  function previewInto(wrap, url) {
    const u = safeUrl(url);
    wrap.querySelector('.image-field__preview').innerHTML = u ? `<img src="${esc(cld(u, 240))}" alt="">` : '<span>No image</span>';
  }

  async function pickAndUpload(wrap) {
    const file = await pickFile();
    if (!file) return;
    const input = wrap.querySelector('input[type="url"]'), bar = wrap.querySelector('.progress'), fill = bar.firstElementChild;
    const form = wrap.closest('form'), title = form && form.elements.namedItem('title');
    if (title && !title.value.trim()) title.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

    if (S.demo) {
      const url = URL.createObjectURL(file);
      input.value = url;
      previewInto(wrap, url);
      toast('Demo mode: the image is previewed here but not uploaded.', 'warn');
      return;
    }
    const saveButtons = $$('#modal-save, #general-form [type="submit"]');
    bar.hidden = false;
    fill.style.width = '0%';
    saveButtons.forEach(b => { b.disabled = true; });
    try {
      const res = await API.uploadImage(file, p => { fill.style.width = `${p}%`; });
      input.value = res.url;
      previewInto(wrap, res.url);
      toast('Image uploaded. Save to publish it.');
    } catch (err) { handleError(err); }
    finally { bar.hidden = true; saveButtons.forEach(b => { b.disabled = false; }); }
  }

  /* --------------------------------------------------------------- enquiries */
  function renderEnquiries() {
    const all = [...S.data.leads].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const count = s => all.filter(l => (l.status || 'New') === s).length;
    const f = S.leadFilter;
    const rows = f === 'all' ? all : all.filter(l => (l.status || 'New') === f);
    view(`
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Filter enquiries by status">
          ${['all', ...LEAD_STATUSES].map(s => `<button type="button" class="seg" data-lead-filter="${s}" aria-pressed="${f === s}">${s === 'all' ? 'All' : s}<span>${s === 'all' ? all.length : count(s)}</span></button>`).join('')}
        </div>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">Date</th><th scope="col">Name</th><th scope="col">Phone</th><th scope="col">Message</th><th scope="col">Status</th></tr></thead>
        <tbody>${rows.map(l => {
          const status = l.status || 'New', intl = intlPhone(l.phone);
          return `<tr data-lead="${esc(l.id)}">
            <td class="nowrap">${esc(fmtDateTime(l.date))}</td>
            <td><strong>${esc(l.name)}</strong></td>
            <td class="nowrap">${intl ? `<a href="tel:+${intl}">${esc(l.phone)}</a> · <a href="https://wa.me/${intl}" target="_blank" rel="noopener">WhatsApp</a>` : esc(l.phone)}</td>
            <td class="msg">${esc(l.message || '—')}</td>
            <td><select class="status-select status--${status.toLowerCase()}" data-lead-status aria-label="Status for ${esc(l.name)}">${LEAD_STATUSES.map(s => `<option${s === status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty"><p>${all.length ? 'No enquiries with this status.' : 'No enquiries yet. Messages from the website form will appear here.'}</p></div>`}`);
  }

  async function updateLead(id, status, select) {
    const lead = S.data.leads.find(l => String(l.id) === String(id));
    if (!lead) return;
    const previous = lead.status || 'New';
    lead.status = status;
    select.className = `status-select status--${status.toLowerCase()}`;
    select.disabled = true;
    try {
      if (!S.demo) await API.updateEnquiryStatus(id, status);
      toast(`Enquiry marked as ${status.toLowerCase()}.`);
      updateBadge();
    } catch (err) {
      lead.status = previous;
      select.value = previous;
      select.className = `status-select status--${previous.toLowerCase()}`;
      handleError(err);
    } finally { select.disabled = false; }
  }

  function updateBadge() {
    const n = S.data ? S.data.leads.filter(l => (l.status || 'New') === 'New').length : 0;
    const badge = $('#nav-leads-badge');
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  /* ---------------------------------------------------------------- settings */
  function renderSettings() {
    const d = S.data;
    const kv = rows => `<dl class="kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
    const show = v => (isPlaceholder(v) ? '<span class="pill">Not set</span>' : esc(v));
    const configRows = Object.keys(d.config).map(k => [k, show(d.config[k])]);
    view(`<div class="settings-grid">
      <section class="panel">
        <header class="panel__head"><h2>Connection</h2></header>
        ${kv([
          ['Mode', S.demo ? '<span class="pill pill--warn">Demo</span>' : '<span class="pill pill--on">Live</span>'],
          ['Google Sheets API', API.isConfigured() ? 'Configured' : '<span class="pill">Not set</span>'],
          ['Image uploads', cloudinaryReady() ? 'Ready' : '<span class="pill">Not set up</span>'],
          ['Upload mode', esc(API.cloudinaryMode())],
          ['Backend version', esc(d.meta.version || '—')]
        ])}
        <div class="panel__actions">
          <button type="button" class="btn btn--ghost btn--sm" data-settings="test">Test connection</button>
          <button type="button" class="btn btn--ghost btn--sm" data-settings="cache">Clear saved content in this browser</button>
        </div>
      </section>
      <section class="panel">
        <header class="panel__head"><h2>Website configuration</h2><small>js/config.js</small></header>
        ${kv([
          ['API_URL', show(CONFIG.API_URL)],
          ['CLOUDINARY_UPLOAD_MODE', esc(CONFIG.CLOUDINARY_UPLOAD_MODE)],
          ['CLOUDINARY_CLOUD_NAME', show(CONFIG.CLOUDINARY_CLOUD_NAME)],
          ['CLOUDINARY_UPLOAD_PRESET', show(CONFIG.CLOUDINARY_UPLOAD_PRESET)],
          ['CACHE_MINUTES', esc(CONFIG.CACHE_MINUTES)]
        ])}
        <p class="panel__note">These values are public by design. Change them by editing js/config.js in the GitHub repository. Never put API secrets or passwords in that file.</p>
      </section>
      <section class="panel">
        <header class="panel__head"><h2>Sheet “Config” tab</h2></header>
        ${configRows.length ? kv(configRows) : '<p class="panel__note panel__note--top">Shown when connected to Google Sheets.</p>'}
        <p class="panel__note">Edit these directly in the Google Sheet. Secrets such as the Cloudinary API secret and the admin password are kept in Apps Script > Project Settings > Script Properties, never in the sheet.</p>
      </section>
      <section class="panel">
        <header class="panel__head"><h2>Security</h2></header>
        <ul class="notes">
          <li>To change the admin password, open the Google Sheet and use <strong>SSV Admin > Set admin password</strong>. Everyone signed in is signed out.</li>
          <li>Sessions end after 6 hours without activity, or when this tab is closed.</li>
          <li>Five wrong passwords in a row lock sign-in for 15 minutes.</li>
        </ul>
        <button type="button" class="btn btn--danger btn--sm" data-settings="logout">Sign out</button>
      </section>
    </div>`);
  }

  async function settingsAction(action, btn) {
    if (action === 'logout') return logout();
    if (action === 'cache') { API.clearCache(); toast('Saved website content cleared in this browser.'); return; }
    if (action === 'test') {
      if (!API.isConfigured()) { toast('API_URL is not set in js/config.js.', 'error'); return; }
      setBusy(btn, true, 'Testing…');
      try { const h = await API.health(); toast(`Connected. Backend version ${h.version}.`); }
      catch (err) { handleError(err); }
      finally { setBusy(btn, false); }
    }
  }

  /* ------------------------------------------------------------------ chrome */
  let submitHandler = null;
  function openModal({ title, body, submitLabel = 'Save', onSubmit }) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    $('#modal-save').textContent = submitLabel;
    submitHandler = onSubmit;
    $('#modal').showModal();
    const first = $('#modal-body').querySelector('input:not([type="checkbox"]):not([type="url"]), textarea, select');
    if (first) first.focus();
  }

  async function onModalSubmit(e) {
    e.preventDefault();
    const btn = $('#modal-save');
    if (!submitHandler || btn.disabled) return;
    setBusy(btn, true, 'Saving…');
    const ok = await submitHandler(e.currentTarget);
    setBusy(btn, false);
    if (ok !== false) $('#modal').close();
  }

  function onViewClick(e) {
    const t = e.target;
    const wrap = t.closest('[data-collection]'), key = wrap && wrap.dataset.collection;
    if (t.closest('[data-upload-new]')) return openEditor('gallery', null, { pick: true });
    if (t.closest('[data-add]') && key) return openEditor(key);
    const filter = t.closest('[data-lead-filter]');
    if (filter) { S.leadFilter = filter.dataset.leadFilter; return renderEnquiries(); }
    const setting = t.closest('[data-settings]');
    if (setting) return settingsAction(setting.dataset.settings, setting);

    const act = t.closest('[data-act]');
    if (!act || !key) return;
    const id = act.closest('[data-id]').dataset.id;
    const rec = S.data[key].find(r => String(r.id) === id);
    if (!rec) return;
    const name = rec.name || rec.title || 'this item';
    switch (act.dataset.act) {
      case 'edit': openEditor(key, rec); break;
      case 'toggle': persist(key, { ...rec, active: !truthy(rec.active) }, truthy(rec.active) ? `"${name}" is now hidden from the website.` : `"${name}" is now shown on the website.`); break;
      case 'delete': if (confirm(`Delete "${name}"? This removes it from the Google Sheet and can't be undone.`)) removeRecord(key, rec); break;
      case 'up': move(key, rec, -1); break;
      case 'down': move(key, rec, 1); break;
    }
  }

  function setBusy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; if (label) btn.textContent = label; btn.disabled = true; }
    else { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  function toast(message, type = 'ok') {
    const host = $('#modal').open ? $('#modal-toasts') : $('#toasts');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    host.append(el);
    setTimeout(() => el.classList.add('is-out'), type === 'error' ? 6000 : 3500);
    setTimeout(() => el.remove(), type === 'error' ? 6400 : 3900);
  }

  function handleError(err) {
    console.error(err);
    if (err && err.code === 'AUTH_REQUIRED') {
      if ($('#modal').open) $('#modal').close();
      API.setToken(null);
      S.data = null;
      showLogin();
      $('#login-msg').textContent = err.message;
      return;
    }
    toast(err && err.message ? err.message : 'Something went wrong. Try again.', 'error');
  }

  async function logout() {
    if (!S.demo) await API.logout();
    S.demo = false;
    S.data = null;
    history.replaceState(null, '', location.pathname);
    showLogin();
  }

  function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', open);
    $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  }

  function bindChrome() {
    $('#login-form').addEventListener('submit', onLogin);
    $('#demo-btn').addEventListener('click', () => { S.demo = true; enterApp(); });
    $('#logout-btn').addEventListener('click', logout);
    $('#refresh-btn').addEventListener('click', async () => {
      await loadData();
      route();
      toast(S.demo ? 'Demo data reset.' : 'Content refreshed from Google Sheets.');
    });
    $('#sidebar-toggle').addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
    $('#scrim').addEventListener('click', () => setSidebar(false));
    $('#modal-form').addEventListener('submit', onModalSubmit);
    $$('#modal [data-close]').forEach(b => b.addEventListener('click', () => $('#modal').close()));
    $('#view').addEventListener('click', onViewClick);
    $('#view').addEventListener('change', e => {
      const select = e.target.closest('[data-lead-status]');
      if (select) updateLead(select.closest('[data-lead]').dataset.lead, select.value, select);
    });
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-upload]');
      if (btn) pickAndUpload(btn.closest('[data-image-field]'));
    });
    document.addEventListener('input', e => {
      if (e.target.matches('[data-image-field] input[type="url"]')) previewInto(e.target.closest('[data-image-field]'), e.target.value);
    });
    window.addEventListener('hashchange', () => { route(); $('#view-title').focus(); });
  }

  boot();
})();
