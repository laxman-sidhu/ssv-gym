/* ==========================================================================
   SSV GYM — PUBLIC WEBSITE
   Loads content through API.getContent() (js/api.js), renders every section
   and wires up navigation, reveals, the enquiry form and contact links.
   ========================================================================== */
(() => {
  'use strict';

  const { esc, splitList, truthy, media, img, isPlaceholder, intlPhone, digits, safeUrl, cld,
          formatDate, formatPrice, activeSorted, initials, toDate } = Utils;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.1l-5.62 2.99 1.07-6.27L2.9 9.4l6.3-.9z"/></svg>';
  const state = { data: null, links: {}, gymName: 'SSV Gym' };

  /* ------------------------------------------------------------------ boot */
  async function init() {
    setupNav();
    setupHeader();
    setupEnquiry();
    setupInteractions();
    setupReveal();
    $('#year').textContent = new Date().getFullYear();

    document.body.classList.add('is-loading');
    const data = state.data = await API.getContent();
    document.body.classList.toggle('is-sample', data.isSample);

    [
      () => renderGeneral(data.general),
      () => renderStats(data.general),
      () => renderAnnouncements(data.announcements),
      () => renderFacilities(data.facilities),
      () => renderPlans(data.plans),
      () => renderTrainers(data.trainers),
      () => renderGallery(data.gallery),
      () => renderTestimonials(data.testimonials)
    ].forEach(render => {
      try { render(); } catch (err) { console.error('[SSV] A section failed to render:', err); }
    });

    document.body.classList.remove('is-loading');
    countUp();
    setupActiveNav();
    if (data.isSample) showSampleNotice();
  }

  /* ------------------------------------------------------ general content */
  function renderGeneral(g) {
    state.gymName = g.gym_name || 'SSV Gym';

    $$('[data-g]').forEach(el => { const v = g[el.dataset.g]; if (v !== undefined && String(v).trim() !== '') el.textContent = v; });
    $$('[data-g-lines]').forEach(el => { const parts = splitList(g[el.dataset.gLines]); if (parts.length) el.innerHTML = parts.map(esc).join('<br>'); });
    $$('[data-g-list]').forEach(el => { const parts = splitList(g[el.dataset.gList]); if (parts.length) el.innerHTML = parts.map(p => `<li>${esc(p)}</li>`).join(''); });
    $$('.contact__list [data-g], .contact__list [data-g-lines]').forEach(el => el.classList.toggle('is-placeholder', isPlaceholder(el.textContent)));

    const heading = splitList(g.hero_heading), headingEl = $('#hero-heading');
    if (heading.length && headingEl.textContent !== heading.join('')) {
      headingEl.innerHTML = heading.map(line => `<span class="hero__line">${esc(line)}</span>`).join('');
    }
    const about = splitList(g.about_text);
    if (about.length) $('#about-text').innerHTML = about.map(p => `<p>${esc(p)}</p>`).join('');
    $('#about-highlights').innerHTML = splitList(g.about_highlights).map(h => `<li>${esc(h)}</li>`).join('');
    if (g.description) $('meta[name="description"]').setAttribute('content', g.description);

    setMedia('#hero-media', g.hero_image, `${state.gymName} training floor`, { sizes: '100vw', widths: [800, 1200, 1600, 2000], eager: true });
    setMedia('#about-media', g.about_image, `Inside ${g.full_name || state.gymName}`, { sizes: '(min-width: 920px) 45vw, 100vw' });
    setupLinks(g);
    setupMap(g.maps_embed_url);
    updateStructuredData(g);
  }

  function setMedia(selector, url, alt, opts) {
    const box = $(selector);
    if (!box) return;
    const tag = img(url, alt, opts);
    box.innerHTML = tag;
    box.classList.toggle('has-img', Boolean(tag));
  }

  /* Call / WhatsApp / Maps / Instagram links. Missing values are dimmed and point to #contact. */
  function setupLinks(g) {
    const phone = intlPhone(g.phone), wa = intlPhone(g.whatsapp || g.phone);
    const L = state.links = {
      phone: phone ? `tel:+${phone}` : '',
      whatsapp: wa ? `https://wa.me/${wa}` : '',
      maps: safeUrl(g.maps_url),
      instagram: safeUrl(g.instagram_url)
    };
    const waText = encodeURIComponent(`Hi ${state.gymName}, I'd like to know more about membership.`);
    $$('[data-link]').forEach(a => {
      const key = a.dataset.link;
      let href = L[key];
      if (href && key === 'whatsapp') href += `?text=${waText}`;
      a.classList.toggle('is-unset', !href);
      if (href) {
        a.href = href;
        a.removeAttribute('aria-disabled');
        a.removeAttribute('title');
        if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
      } else {
        a.href = '#contact';
        a.setAttribute('aria-disabled', 'true');
        a.title = 'Not added yet';
        a.removeAttribute('target');
      }
    });
    const ig = $('#ig-handle'), m = L.instagram.match(/instagram\.com\/([\w.]+)/i);
    ig.textContent = m ? '@' + m[1] : (L.instagram ? 'Instagram' : 'To be added');
    ig.classList.toggle('is-placeholder', !L.instagram);
  }

  function setupMap(url) {
    const box = $('#map-embed'), src = safeUrl(url);
    if (!src || !/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed/i.test(src)) { box.hidden = true; return; }
    box.innerHTML = `<iframe src="${esc(src)}" title="Map showing the location of ${esc(state.gymName)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
    box.hidden = false;
  }

  /* Keep LocalBusiness JSON-LD in sync with the CMS and drop leftover YOUR_* placeholders. */
  function updateStructuredData(g) {
    const el = $('#ld-business');
    if (!el) return;
    try {
      const ld = JSON.parse(el.textContent), L = state.links;
      ld.name = g.gym_name || ld.name;
      ld.alternateName = g.full_name || ld.alternateName;
      if (/^https?:/.test(location.href)) ld.url = location.origin + location.pathname;
      const real = !state.data.isSample; // never publish dummy details to search engines
      if (real && !isPlaceholder(g.address)) ld.address = { '@type': 'PostalAddress', streetAddress: splitList(g.address).join(', '), addressCountry: 'IN' };
      if (real && L.phone) ld.telephone = '+' + intlPhone(g.phone);
      if (real && L.maps) ld.hasMap = L.maps;
      if (real && L.instagram) ld.sameAs = [L.instagram]; else delete ld.sameAs;
      el.textContent = JSON.stringify(ld, (k, v) => (typeof v === 'string' && /^YOUR_/.test(v) ? undefined : v));
    } catch { /* keep the static JSON-LD */ }
  }

  /* ----------------------------------------------------------------- stats */
  function renderStats(g) {
    const stats = [1, 2, 3, 4, 5, 6]
      .map(n => ({ value: String(g[`stat_${n}_value`] ?? '').trim(), label: String(g[`stat_${n}_label`] ?? '').trim() }))
      .filter(s => s.value && s.label);
    $('#stats').hidden = !stats.length;
    const animate = !reduceMotion && 'IntersectionObserver' in window;
    $('#stats-grid').innerHTML = stats.map(s => {
      const m = s.value.match(/^(\D*?)(\d[\d,]*)(.*)$/);
      const shown = m
        ? `${esc(m[1])}<span class="stat__num" data-count="${m[2].replace(/,/g, '')}">${animate ? '0' : esc(m[2])}</span><span class="stat__affix">${esc(m[3])}</span>`
        : esc(s.value);
      return `<div class="stat"><dt class="stat__label">${esc(s.label)}</dt><dd class="stat__value"><span class="sr-only">${esc(s.value)}</span><span aria-hidden="true">${shown}</span></dd></div>`;
    }).join('');
  }

  function countUp() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el = entry.target, target = Number(el.dataset.count), t0 = performance.now(), dur = 1400;
      const tick = now => {
        const p = Math.min((now - t0) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN');
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.5 });
    $$('.stat__num[data-count]').forEach(el => io.observe(el));
  }

  /* --------------------------------------------------------- announcements */
  function renderAnnouncements(list) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items = (Array.isArray(list) ? list : [])
      .filter(a => truthy(a.active) && a.title)
      .filter(a => { const exp = toDate(a.expiry); return !exp || exp >= today; })
      .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(b.date).localeCompare(String(a.date)));
    $('#announcements').hidden = !items.length;
    $('#notice-list').innerHTML = items.slice(0, 3).map(a => `
      <li class="notice__item">
        ${a.date ? `<time datetime="${esc(a.date)}">${esc(formatDate(a.date))}</time>` : '<span></span>'}
        <div><h3>${esc(a.title)}</h3>${a.description ? `<p>${esc(a.description)}</p>` : ''}</div>
      </li>`).join('');
  }

  /* ------------------------------------------------------------ facilities */
  function renderFacilities(list) {
    const items = activeSorted(list);
    const isExtra = f => String(f.category || '').trim().toLowerCase() === 'additional';
    const major = items.filter(f => !isExtra(f)), extra = items.filter(isExtra);
    toggleSection('facilities', items.length);

    $('#facility-grid').innerHTML = major.map(f => {
      const tags = splitList(f.tags);
      return `<a class="facility-card" href="#gallery" data-gallery-filter="${Gallery.categoryFor(f.name)}" aria-label="${esc(f.name)}: view photos">
        ${media(f.image_url, f.name, `${f.name} photo`, { cls: 'facility-card__media', sizes: '(min-width: 1024px) 33vw, (min-width: 760px) 50vw, 100vw' })}
        <span class="facility-card__arrow" aria-hidden="true">${ARROW}</span>
        <div class="facility-card__body">
          <h3 class="facility-card__title">${esc(f.name)}</h3>
          ${tags.length ? `<p class="facility-card__tags">${tags.map(esc).join('<i aria-hidden="true"> \u2022 </i>')}</p>` : ''}
          ${f.description ? `<p class="facility-card__desc">${esc(f.description)}</p>` : ''}
        </div>
      </a>`;
    }).join('');

    $('#facility-extra').hidden = !extra.length;
    $('#facility-extra-list').innerHTML = extra.map(f => `<li><div><h4>${esc(f.name)}</h4>${f.description ? `<p>${esc(f.description)}</p>` : ''}</div></li>`).join('');

    const tag = $('.about__tag');
    $('#zone-count').textContent = major.length;
    tag.hidden = !major.length;
  }

  /* ------------------------------------------------------------ membership */
  function renderPlans(list) {
    const items = activeSorted(list);
    toggleSection('membership', items.length);
    const badge = state.data.general.featured_badge_text || 'Featured';
    const board = $('#plan-grid');
    board.style.setProperty('--cols', Math.min(Math.max(items.length, 1), 4));
    board.innerHTML = items.map(p => {
      const featured = truthy(p.featured);
      const months = Number((String(p.duration).match(/\d+/) || [0])[0]);
      const amount = Number(String(p.price).replace(/[₹,\s]/g, ''));
      const perMonth = /month/i.test(p.duration) && months > 1 && amount > 0 ? `about ₹${Math.round(amount / months).toLocaleString('en-IN')} a month` : '';
      const features = splitList(p.features);
      const wa = state.links.whatsapp;
      const href = wa ? `${wa}?text=${encodeURIComponent(`Hi ${state.gymName}, I'd like to enquire about the ${p.name} membership (${p.duration}).`)}` : '#contact';
      return `<article class="plan${featured ? ' plan--featured' : ''}">
        <div class="plan__top"><h3 class="plan__name">${esc(p.name)}</h3>${featured ? `<span class="plan__badge">${esc(badge)}</span>` : ''}</div>
        <p class="plan__price">${esc(formatPrice(p.price))}</p>
        <p class="plan__duration"><span>${esc(p.duration)}</span>${perMonth ? `<span class="plan__per">${perMonth}</span>` : ''}</p>
        <div class="plan__body">
          ${p.description ? `<p class="plan__desc">${esc(p.description)}</p>` : ''}
          ${features.length ? `<ul class="plan__features">${features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        </div>
        <a class="btn ${featured ? 'btn--primary' : 'btn--ghost'} btn--block" href="${esc(href)}" data-plan="${esc(p.name)}"${wa ? ' target="_blank" rel="noopener"' : ''} aria-label="Enquire about the ${esc(p.name)} plan">Enquire</a>
      </article>`;
    }).join('');
  }

  /* -------------------------------------------------------------- trainers */
  function renderTrainers(list) {
    const items = activeSorted(list);
    toggleSection('trainers', items.length);
    $('#trainer-grid').innerHTML = items.map(t => `
      <article class="trainer">
        ${media(t.image_url, `${t.name}, ${t.role || 'trainer'} at ${state.gymName}`, 'Trainer photo', { cls: 'trainer__media', sizes: '(min-width: 1100px) 25vw, (min-width: 640px) 50vw, 100vw', widths: [400, 700, 1000] })}
        <div class="trainer__body">
          <h3 class="trainer__name">${esc(t.name)}</h3>
          ${t.role ? `<p class="trainer__role">${esc(t.role)}</p>` : ''}
          ${t.specialization ? `<p class="trainer__spec">${esc(t.specialization)}</p>` : ''}
          ${t.bio ? `<p class="trainer__bio">${esc(t.bio)}</p>` : ''}
        </div>
      </article>`).join('');
  }

  /* --------------------------------------------------------------- gallery */
  function renderGallery(list) {
    const items = activeSorted(list);
    toggleSection('gallery', items.length);
    Gallery.init(items);
  }

  /* ---------------------------------------------------------- testimonials */
  function renderTestimonials(list) {
    const items = activeSorted(list);
    toggleSection('testimonials', items.length);
    $('#review-grid').innerHTML = items.map(t => {
      const rating = Math.max(0, Math.min(5, Math.round(Number(t.rating) || 0)));
      const photo = safeUrl(t.image_url);
      const avatar = photo
        ? `<span class="avatar"><img src="${esc(cld(photo, 96))}" alt="" loading="lazy"></span>`
        : `<span class="avatar" aria-hidden="true">${esc(initials(t.name))}</span>`;
      const stars = rating
        ? `<div class="review__stars" role="img" aria-label="Rated ${rating} out of 5">${Array.from({ length: 5 }, (_, i) => `<span${i < rating ? ' class="is-on"' : ''}>${STAR}</span>`).join('')}</div>`
        : '';
      return `<figure class="review">${stars}<blockquote><p>${esc(t.review)}</p></blockquote><figcaption>${avatar}<span>${esc(t.name)}</span></figcaption></figure>`;
    }).join('');
  }

  /* Hide a section, its nav links and any buttons that point to it. */
  function toggleSection(id, show) {
    const section = document.getElementById(id);
    if (section) section.hidden = !show;
    $$(`.nav__list a[href="#${id}"], .footer__nav a[href="#${id}"]`).forEach(a => { a.parentElement.hidden = !show; });
    $$(`[data-requires="${id}"]`).forEach(el => { el.hidden = !show; });
  }

  /* ---------------------------------------------------------- interactions */
  function setupNav() {
    const toggle = $('.nav-toggle');
    const setOpen = open => {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
    $('#site-nav').addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setOpen(false); toggle.focus(); }
    });
    const wide = window.matchMedia('(min-width: 1081px)');
    const onWide = e => { if (e.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
  }

  function setupHeader() {
    const header = $('.site-header');
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function setupActiveNav() {
    if (!('IntersectionObserver' in window)) return;
    const links = $$('.nav__link');
    const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(l => { l.classList.remove('is-active'); l.removeAttribute('aria-current'); });
      const link = byId.get(entry.target.id);
      if (link) { link.classList.add('is-active'); link.setAttribute('aria-current', 'true'); }
    }), { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  function setupReveal() {
    const els = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-visible')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach(el => io.observe(el));
  }

  function setupInteractions() {
    // Facility card -> gallery filtered to that area
    $('#facility-grid').addEventListener('click', e => {
      const card = e.target.closest('[data-gallery-filter]');
      if (card) Gallery.setFilter(card.dataset.galleryFilter);
    });
    // Plan "Enquire" without WhatsApp configured -> prefill the enquiry form
    $('#plan-grid').addEventListener('click', e => {
      const link = e.target.closest('[data-plan]');
      if (!link || state.links.whatsapp) return;
      const msg = $('#enquiry-form').elements.namedItem('message');
      if (!msg.value.trim()) msg.value = `I'd like to know about the ${link.dataset.plan} membership plan.`;
    });
  }

  function setupEnquiry() {
    const form = $('#enquiry-form'), status = $('#enquiry-status');
    const setStatus = (html, type = '') => { status.innerHTML = html; status.className = `enquiry__status${type ? ' is-' + type : ''}`; };
    form.addEventListener('input', e => e.target.removeAttribute('aria-invalid'));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = form.elements;
      const data = {
        name: f.namedItem('name').value.trim(),
        phone: f.namedItem('phone').value.trim(),
        message: f.namedItem('message').value.trim(),
        website: f.namedItem('website').value // honeypot, must stay empty
      };
      const phoneDigits = digits(data.phone).length;
      const problem = data.name.length < 2 ? ['name', 'Enter your name.']
        : (phoneDigits < 10 || phoneDigits > 13) ? ['phone', 'Enter a valid phone number, for example 98765 43210.']
        : null;
      if (problem) {
        const input = f.namedItem(problem[0]);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        setStatus(esc(problem[1]), 'error');
        return;
      }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      setStatus('Sending…');
      try {
        await API.submitEnquiry(data);
        form.reset();
        setStatus('Enquiry sent. The gym will contact you on the number you gave.', 'success');
      } catch (err) {
        const wa = state.links.whatsapp;
        const text = encodeURIComponent(`Hi ${state.gymName}, I'm ${data.name} (${data.phone}). ${data.message}`.trim());
        const reason = err.code === 'NOT_CONFIGURED' ? 'The online form is not connected yet.' : esc(err.message);
        setStatus(`${reason} ${wa ? `<a href="${wa}?text=${text}" target="_blank" rel="noopener">Send it on WhatsApp instead</a>.` : 'Please call or visit the gym.'}`, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function showSampleNotice() {
    const box = $('#sample-notice');
    if (!CONFIG.SHOW_SAMPLE_NOTICE) return;
    try { if (sessionStorage.getItem('ssv_sample_notice')) return; } catch { /* ignore */ }
    box.hidden = false;
    box.querySelector('button').addEventListener('click', () => {
      box.hidden = true;
      try { sessionStorage.setItem('ssv_sample_notice', '1'); } catch { /* ignore */ }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
