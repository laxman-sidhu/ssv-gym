/* SSV GYM — small shared helpers used by the public site and the admin panel. */
const Utils = (() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
  const truthy = v => v === true || /^(true|yes|y|1)$/i.test(String(v ?? '').trim());

  /* Lists in the sheet are separated with "|" or new lines. */
  const splitList = v => String(v ?? '').split(/\s*(?:\r?\n|\|)\s*/).map(s => s.trim()).filter(Boolean);

  /* True for empty values and obvious placeholders like "+91 XXXXX XXXXX". */
  const isPlaceholder = v => {
    const s = String(v ?? '').trim();
    return !s || /^YOUR_|X{4,}|will appear here/i.test(s);
  };

  const digits = v => String(v ?? '').replace(/\D/g, '');
  /* International number without "+". 10-digit numbers are assumed to be Indian (+91). */
  const intlPhone = v => {
    const d = digits(v);
    if (d.length === 10) return '91' + d;
    if (d.length === 11 && d[0] === '0') return '91' + d.slice(1);
    return d.length >= 11 && d.length <= 15 ? d : '';
  };

  /* Only allow http(s)/tel/mailto/blob URLs and relative paths. */
  const safeUrl = v => {
    const s = String(v ?? '').trim();
    if (!s || /^YOUR_/i.test(s)) return '';
    if (/^(https?:|mailto:|tel:|blob:)/i.test(s)) return s;
    if (!/^[a-z][\w+.-]*:/i.test(s) && /^(#|\.{0,2}\/|[\w-]+\/)/.test(s)) return s;
    return '';
  };

  const pad2 = n => String(n).padStart(2, '0');
  const toDate = v => {
    if (!v) return null;
    const s = String(v).trim();
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s.replace(' ', 'T'));
    return isNaN(d) ? null : d;
  };
  const formatDate = v => {
    const d = toDate(v);
    return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : String(v ?? '');
  };
  const formatPrice = v => {
    const s = String(v ?? '').trim();
    return /^₹?\s*[\d,]+(\.\d+)?$/.test(s) ? '₹' + Number(s.replace(/[₹,\s]/g, '')).toLocaleString('en-IN') : s;
  };

  const byOrder = (a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0);
  const activeSorted = list => (Array.isArray(list) ? list : []).filter(i => truthy(i.active)).sort(byOrder);
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

  /* True for all-zero dummy numbers such as +91 00000 00000. */
  const isDummyPhone = v => { const d = digits(v).replace(/^91/, ''); return d.length > 0 && /^0+$/.test(d); };

  /* Resize hosted images: Cloudinary uploads, and the Unsplash stock photos used as dummies. */
  const CLD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;
  const UNSPLASH = /^https:\/\/images\.unsplash\.com\//;
  const cld = (url, width) => {
    const s = String(url || '');
    const m = s.match(CLD);
    if (m) return `${m[1]}f_auto,q_auto,c_limit,w_${width}/${m[2]}`;
    if (UNSPLASH.test(s)) {
      try {
        const u = new URL(s);
        u.searchParams.set('auto', 'format');
        u.searchParams.set('fit', 'crop');
        u.searchParams.set('q', '75');
        u.searchParams.set('w', String(width));
        return u.toString();
      } catch { return url; }
    }
    return url;
  };

  /* <img> with lazy loading and a responsive srcset for Cloudinary / Unsplash images. */
  const img = (url, alt, { sizes = '100vw', widths = [480, 800, 1200, 1600], eager = false } = {}) => {
    const u = safeUrl(url);
    if (!u) return '';
    const isCld = CLD.test(u) || UNSPLASH.test(u);
    const srcset = isCld ? ` srcset="${widths.map(w => `${esc(cld(u, w))} ${w}w`).join(', ')}" sizes="${esc(sizes)}"` : '';
    const src = isCld ? cld(u, widths[Math.min(1, widths.length - 1)]) : u;
    return `<img src="${esc(src)}"${srcset} alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  };

  /* Image box that shows a designed placeholder until a photo URL exists. */
  const media = (url, alt, label, opts = {}) => {
    const tag = img(url, alt, opts);
    return `<div class="media ${opts.cls || ''}${tag ? ' has-img' : ''}" data-label="${esc(label)}">${tag}</div>`;
  };

  /* Broken image? Fall back to the placeholder instead of a broken icon. */
  document.addEventListener('error', event => {
    const el = event.target;
    if (!el || el.tagName !== 'IMG') return;
    const box = el.parentElement;
    if (box && box.classList.contains('media')) box.classList.remove('has-img');
    el.remove();
  }, true);

  return { esc, truthy, splitList, isPlaceholder, isDummyPhone, digits, intlPhone, safeUrl, pad2, toDate, formatDate, formatPrice, byOrder, activeSorted, initials, cld, img, media };
})();
