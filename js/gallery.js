/* SSV GYM — gallery grid, category filter and lightbox */
const Gallery = (() => {
  const CATEGORIES = [['all', 'All'], ['gym', 'Gym'], ['crossfit', 'CrossFit'], ['training', 'Training'], ['equipment', 'Equipment'], ['events', 'Events']];
  const SIZES = ['tall', '', 'wide', '', '', 'tall', '', '', '', 'wide']; // repeating layout rhythm
  const { esc, media, pad2 } = Utils;
  const el = id => document.getElementById(id);
  const catOf = item => String(item.category || '').trim().toLowerCase();
  const labelOf = key => (CATEGORIES.find(([k]) => k === key) || [key, key])[1];
  let items = [], view = [], filter = 'all', current = 0, trigger = null, bound = false;

  function init(list) {
    items = Array.isArray(list) ? list : [];
    renderFilters();
    render();
    if (!bound) bind();
  }

  function renderFilters() {
    const present = new Set(items.map(catOf));
    el('gallery-filters').innerHTML = CATEGORIES
      .filter(([k]) => k === 'all' || present.has(k))
      .map(([k, label]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${k === filter}">${label}</button>`)
      .join('');
  }

  function setFilter(key) {
    const bar = el('gallery-filters');
    filter = bar.querySelector(`[data-filter="${key}"]`) ? key : 'all';
    bar.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
    render();
  }

  function render() {
    view = filter === 'all' ? items : items.filter(i => catOf(i) === filter);
    const grid = el('gallery-grid');
    grid.innerHTML = view.map((it, i) => {
      const size = SIZES[i % SIZES.length];
      const title = it.title || 'Gallery photo';
      return `<figure class="g-item${size ? ' g-item--' + size : ''}" style="--i:${i}">
        <button type="button" class="g-item__btn" data-index="${i}" aria-label="View larger: ${esc(title)}">
          ${media(it.image_url, title, title, { cls: `g-item__media tone-${i % 4}`, sizes: '(min-width: 1100px) 25vw, (min-width: 760px) 33vw, 50vw', widths: [400, 700, 1000] })}
          <span class="g-item__overlay"><span class="g-item__cat">${esc(labelOf(catOf(it)))}</span><span class="g-item__title">${esc(title)}</span></span>
        </button>
      </figure>`;
    }).join('');
    grid.classList.remove('is-animating');
    void grid.offsetWidth; // restart the fade
    grid.classList.add('is-animating');
    el('gallery-count').textContent = `${view.length} ${view.length === 1 ? 'photo' : 'photos'}`;
  }

  function bind() {
    bound = true;
    const dlg = el('lightbox');
    el('gallery-filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
    el('gallery-grid').addEventListener('click', e => { const b = e.target.closest('[data-index]'); if (b) open(Number(b.dataset.index), b); });
    dlg.addEventListener('click', e => {
      const act = e.target.closest('[data-lb]');
      if (act) { if (act.dataset.lb === 'close') close(); else step(act.dataset.lb === 'next' ? 1 : -1); return; }
      if (e.target === dlg || e.target.classList.contains('lightbox__inner')) close();
    });
    dlg.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    });
    dlg.addEventListener('close', () => { document.body.classList.remove('lb-open'); if (trigger) trigger.focus(); });
    let x0 = null; // swipe on touch screens
    dlg.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
  }

  function open(index, from) {
    const dlg = el('lightbox');
    trigger = from;
    current = index;
    show();
    document.body.classList.add('lb-open');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function close() {
    const dlg = el('lightbox');
    if (typeof dlg.close === 'function') dlg.close();
    else { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); }
  }

  function step(dir) {
    if (view.length < 2) return;
    current = (current + dir + view.length) % view.length;
    show();
  }

  function show() {
    const it = view[current];
    if (!it) return;
    const title = it.title || 'Gallery photo';
    el('lb-media').innerHTML = media(it.image_url, title, title, { cls: 'lightbox__img', sizes: '90vw', widths: [800, 1400, 2000], eager: true });
    el('lb-title').textContent = title;
    el('lb-caption').textContent = it.caption || '';
    el('lb-count').textContent = `${pad2(current + 1)} / ${pad2(view.length)}`;
    el('lightbox').classList.toggle('is-single', view.length < 2);
  }

  /* Facility cards link to matching gallery photos ("Main Gym" -> gym, "CrossFit" -> crossfit). */
  const categoryFor = name => {
    const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    const hit = CATEGORIES.find(([k]) => k !== 'all' && n.includes(k));
    return hit ? hit[0] : 'all';
  };

  return { init, setFilter, categoryFor };
})();
