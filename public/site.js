/* Las Rocas: solicitudes reales, boletín, clima y medición anónima (con permiso).
   Todo sale por rutas del mismo sitio (/api/...); el navegador nunca ve llaves. */
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]
  const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  const store = { get(k) { try { return localStorage.getItem(k) } catch { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch {} }, del(k) { try { localStorage.removeItem(k) } catch {} } }
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const today = () => iso(new Date())
  const plusDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d) }

  /* ---------- idioma (inglés por defecto; español con el diccionario de es.js) ---------- */
  const ES = window.LR_ES || {}
  const LANG = (() => { const s = store.get('lr_lang'); if (s === 'es' || s === 'en') return s; return /^es\b/i.test(navigator.language || '') ? 'es' : 'en' })()
  const T = (s) => (LANG === 'es' && ES[s]) || s
  const ATTRS = ['placeholder', 'aria-label', 'title']
  function trText(n) {
    const raw = n.nodeValue, key = raw.replace(/\s+/g, ' ').trim()
    if (!key) return
    const es = ES[key]
    if (es) n.nodeValue = raw.replace(/^(\s*)[\s\S]*?(\s*)$/, (_m, a, b) => a + es + b)
  }
  function trTree(root) {
    if (root.nodeType === 3) return trText(root)
    if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
    const nodes = []; let n; while ((n = w.nextNode())) nodes.push(n)
    nodes.forEach(trText)
    ;[root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')].forEach((el) => ATTRS.forEach((a) => { const v = el.getAttribute && el.getAttribute(a); if (v && ES[v]) el.setAttribute(a, ES[v]) }))
  }
  document.documentElement.lang = LANG
  if (LANG === 'es') {
    trTree(document.body)
    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', 'Hotel frente al mar en Playas de Rosarito, en el K38, a 48 km de San Diego. Dos albercas, tres jacuzzis, spa holístico y todas las habitaciones con vista al Pacífico.')
    document.title = 'Las Rocas Resort & Spa · Hotel frente al mar en Rosarito'
    new MutationObserver((list) => list.forEach((m) => {
      if (m.type === 'characterData') trText(m.target)
      else m.addedNodes.forEach(trTree)
    })).observe(document.body, { childList: true, subtree: true, characterData: true })
  }
  $$('[data-lang]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === LANG))
    b.addEventListener('click', () => { if (b.dataset.lang !== LANG) { store.set('lr_lang', b.dataset.lang); location.reload() } })
  })

  const ROOMS = [['king', 'Oceanfront King Room'], ['double', 'Oceanfront Double Room'], ['gaviotas', 'Oceanfront Gaviotas King Suite'], ['junior-king', 'Oceanfront Junior King Suite'], ['junior-queen', 'Junior Suite, Two Queen Beds'], ['garden-king', 'Oceanfront Garden King Suite'], ['garden-two-king', 'Garden Suite, Two King Beds'], ['two-story', 'Two-Bedroom Two-Story Suite']]
  const VENUES = [['meson', 'El Mesón'], ['palapa', 'La Palapa'], ['cafe', 'Café del Mar'], ['ole', 'Bar Olé']]

  /* ---------- envío ---------- */
  const visitor = () => (store.get('lr_consent') === 'yes' ? store.get('lr_vid') : null)
  async function send(path, body) {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => ({}))
      return res.ok && out.ok !== false ? { ok: true } : { ok: false, error: out.error || 'We could not send it. Please try again or call us.' }
    } catch {
      return { ok: false, error: 'No connection. Please try again or call us at 1 866 445 8909.' }
    }
  }
  // "Email or phone" en un solo campo.
  const splitContact = (v) => (/@/.test(v) ? { email: v.trim() } : { phone: v.trim() })

  /* ---------- ventana de solicitud ---------- */
  const opt = (list, sel) => list.map(([k, n]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${n}</option>`).join('')
  const KINDS = {
    reserva: { kick: 'Book direct', title: 'Request your stay', sub: 'Tell us your dates. Our reservations team confirms availability and your rate, usually within a few hours. No payment is taken here.', cta: 'Send booking request' },
    mesa: { kick: 'Restaurants & bars', title: 'Reserve a table', sub: 'Pick the place and time. We confirm your table by phone or WhatsApp.', cta: 'Request table' },
    spa: { kick: 'Holistic Spa', title: 'Book a treatment', sub: 'Choose a day and time. The spa confirms your appointment.', cta: 'Request appointment' },
    evento: { kick: 'Events', title: 'Reserve your place', sub: 'Tell us how many are coming and we will contact you with the details.', cta: 'Send request' },
  }
  function fields(kind, ctx) {
    const t = today()
    const who = `<label>Full name<input name="name" required autocomplete="name"></label>
      <label>Phone / WhatsApp<input name="phone" type="tel" autocomplete="tel" placeholder="+1 619 555 0142"></label>
      <label class="full">Email<input name="email" type="email" autocomplete="email" placeholder="you@email.com"></label>`
    const msg = (ph) => `<label class="full">Anything else?<textarea name="message" rows="2" placeholder="${ph}"></textarea></label>`
    if (kind === 'reserva') return `
      <label>Arrival<input name="check_in" type="date" required min="${t}" value="${ctx.check_in || ''}"></label>
      <label>Departure<input name="check_out" type="date" required min="${plusDays(t, 1)}" value="${ctx.check_out || ''}"></label>
      <label>Adults<input name="adults" type="number" min="1" max="20" value="2" required></label>
      <label>Children<input name="children" type="number" min="0" max="20" value="0"></label>
      <label class="full">Room<select name="room_key"><option value="">Help me choose</option>${opt(ROOMS, ctx.room)}</select></label>
      ${ctx.itemName ? `<label class="full">Package<input name="item_name" value="${ctx.itemName.replace(/"/g, '&quot;')}" readonly></label>` : ''}
      <label class="full chk"><input name="pets" type="checkbox">Traveling with a pet ($30 USD per stay)</label>
      ${who}${msg('Anniversary, late arrival, questions...')}`
    if (kind === 'mesa') return `
      <label class="full">Where<select name="item_key">${opt(VENUES, ctx.venue)}</select></label>
      <label>Date<input name="date" type="date" required min="${t}"></label>
      <label>Time<input name="time" type="time" required value="19:00"></label>
      <label class="full">Guests<input name="adults" type="number" min="1" max="60" value="2" required></label>
      ${who}${msg('Birthday, ocean view table, allergies...')}`
    if (kind === 'spa') return `
      <label class="full">Treatment<input name="item_name" value="${(ctx.itemName || '').replace(/"/g, '&quot;')}" placeholder="Swedish massage, facial..."></label>
      <label>Date<input name="date" type="date" required min="${t}"></label>
      <label>Time<input name="time" type="time" required value="11:00"></label>
      <label class="full">Guests<input name="adults" type="number" min="1" max="10" value="1" required></label>
      ${who}${msg('Couples massage, preferences...')}`
    return `
      <label>Adults<input name="adults" type="number" min="1" max="40" value="2" required></label>
      <label>Children<input name="children" type="number" min="0" max="40" value="0"></label>
      <label class="full chk"><input name="lodging" type="checkbox">I also need a room that night</label>
      ${who}${msg('Questions about the event...')}`
  }
  function payload(kind, form, ctx) {
    const v = Object.fromEntries(new FormData(form).entries())
    const body = { kind, name: v.name, phone: v.phone || '', email: v.email || '', message: v.message || '', language: LANG, website: v.website || '', visitor_id: visitor() }
    if (v.adults) body.adults = Number(v.adults)
    if (v.children !== undefined && v.children !== '') body.children = Number(v.children)
    if (kind === 'reserva') Object.assign(body, { check_in: v.check_in, check_out: v.check_out, room_key: v.room_key || '', pets: !!form.elements.pets?.checked, item_key: v.item_name ? slug(v.item_name) : '', details: v.item_name ? { paquete: v.item_name } : {} })
    if (kind === 'mesa') Object.assign(body, { item_key: v.item_key, check_in: v.date, details: { hora: v.time, lugar: (VENUES.find((x) => x[0] === v.item_key) || [])[1] || '' } })
    if (kind === 'spa') Object.assign(body, { item_key: slug(v.item_name), check_in: v.date, details: { hora: v.time, tratamiento: v.item_name || '' } })
    if (kind === 'evento') Object.assign(body, { item_key: ctx.item || 'evento', details: { hospedaje: !!form.elements.lodging?.checked, evento: ctx.itemName || '' } })
    return body
  }
  function check(kind, form) {
    $$('[aria-invalid]', form).forEach((e) => e.removeAttribute('aria-invalid'))
    const bad = (name, msg) => { const el = form.elements[name]; if (el) { el.setAttribute('aria-invalid', 'true'); el.focus() } return msg }
    const v = Object.fromEntries(new FormData(form).entries())
    if (!v.name || v.name.trim().length < 2) return bad('name', 'Please tell us your name.')
    if (kind === 'reserva') {
      if (!v.check_in) return bad('check_in', 'Choose your arrival date.')
      if (!v.check_out) return bad('check_out', 'Choose your departure date.')
      if (v.check_out <= v.check_in) return bad('check_out', 'Departure must be after arrival.')
    } else if ((kind === 'mesa' || kind === 'spa') && !v.date) return bad('date', 'Choose a date.')
    if (!v.phone && !v.email) return bad('phone', 'Leave a phone or an email so we can reach you.')
    if (v.phone && v.phone.replace(/\D/g, '').length < 7) return bad('phone', 'That phone number looks too short.')
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) return bad('email', 'That email does not look right.')
    return null
  }

  let modal = null, lastFocus = null
  function closeModal() {
    if (!modal) return
    const m = modal; modal = null
    m.classList.remove('on'); document.removeEventListener('keydown', onKey)
    setTimeout(() => m.remove(), 300)
    document.documentElement.style.overflow = ''
    lastFocus?.focus?.()
  }
  function onKey(e) {
    if (e.key === 'Escape') return closeModal()
    if (e.key !== 'Tab' || !modal) return
    const f = $$('button,input,select,textarea,a[href]', modal).filter((x) => !x.disabled && x.offsetParent !== null && !x.classList.contains('hp'))
    if (!f.length) return
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus() }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus() }
  }
  function openRequest(kind, ctx = {}) {
    const K = KINDS[kind]; if (!K) return
    closeModal(); lastFocus = document.activeElement
    const m = document.createElement('div')
    m.className = 'rqm'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', K.title)
    m.innerHTML = `<div class="box"><div class="hd"><div><div class="kick">${ctx.kick || K.kick}</div><h2>${ctx.title || K.title}</h2></div><button class="x" type="button" aria-label="Close">×</button></div>
      <p class="sub">${K.sub}</p>
      <form class="rq" novalidate><div class="f2">${fields(kind, ctx)}</div>
        <input name="website" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <button class="btn solid" type="submit">${K.cta}</button><div class="ok err" role="alert" hidden></div>
        <p class="note">We never ask for card numbers on this form. <a href="#privacy" style="color:inherit">Privacy</a></p></form></div>`
    document.body.appendChild(m); modal = m
    document.documentElement.style.overflow = 'hidden'
    requestAnimationFrame(() => m.classList.add('on'))
    const form = $('form', m), err = $('.ok', m), btn = $('button[type=submit]', m)
    $('.x', m).onclick = closeModal
    m.addEventListener('mousedown', (e) => { if (e.target === m) closeModal() })
    $$('a[href^="#"]', m).forEach((a) => a.addEventListener('click', closeModal))
    document.addEventListener('keydown', onKey)
    const ci = form.elements.check_in, co = form.elements.check_out
    if (ci && co) ci.addEventListener('change', () => { if (ci.value) { co.min = plusDays(ci.value, 1); if (!co.value || co.value <= ci.value) co.value = plusDays(ci.value, 1) } })
    ;(ci && !ci.value ? ci : form.elements.name)?.focus()
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const problem = check(kind, form)
      if (problem) { err.textContent = problem; err.hidden = false; return }
      err.hidden = true; btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending...'
      const out = await send('/api/solicitud', payload(kind, form, ctx))
      if (!out.ok) { btn.disabled = false; btn.textContent = label; err.textContent = out.error; err.hidden = false; return }
      track('click', 'solicitud-' + kind)
      $('.box', m).innerHTML = `<div class="done" role="status"><div class="tick">✓</div><h2>Request received</h2><p>Thank you. Our team will contact you shortly to confirm the details.</p><button class="btn solid" type="button" style="margin-top:22px;cursor:pointer">Done</button></div>`
      const done = $('.done button', m); done.onclick = closeModal; done.focus()
    })
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-req]'); if (!a) return
    e.preventDefault()
    const kind = a.dataset.req, ctx = {}
    if (a.dataset.roomFrom === 'hash') ctx.room = (location.hash.match(/^#room-(.+)$/) || [])[1]
    if (a.dataset.itemName) ctx.itemName = a.dataset.itemName
    if (a.dataset.itemFrom === 'rail') ctx.itemName = a.closest('.feat')?.querySelector('h3')?.textContent?.trim() || ''
    if (kind === 'mesa') ctx.venue = $('#dine-stage [role=tab][aria-selected=true]')?.dataset.k
    track('click', 'cta-' + kind)
    openRequest(kind, ctx)
  })

  /* ---------- novedades: lo que el hotel publica desde su panel ---------- */
  const NEWS = { eventos: ['Event', 'evento', 'Reserve your place'], paquetes: ['Package', 'reserva', 'Book this package'], spa: ['Spa', 'spa', 'Book a treatment'], restaurantes: ['Restaurants & bars', 'mesa', 'Reserve a table'], general: ['News', null, ''], faq: ['Good to know', null, ''] }
  fetch('/api/contenido').then((r) => (r.ok ? r.json() : null)).then((d) => {
    const grid = $('#news-grid'), sec = $('#news')
    if (!grid || !sec || !d || !d.sections) return
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e }
    for (const key of Object.keys(NEWS)) {
      for (const it of d.sections[key] || []) {
        const [tag, kind, cta] = NEWS[key]
        const card = el('article', 'nw')
        card.append(el('div', 'tag', T(tag)), el('h3', '', it.title))
        if (it.description) card.append(el('p', '', it.description))
        const meta = el('div', 'meta')
        if (it.price) meta.append(el('span', '', it.price))
        if (it.schedule) meta.append(el('span', '', it.schedule))
        if (meta.childNodes.length) card.append(meta)
        if (kind) {
          const b = el('button', 'btn solid', T(cta)); b.type = 'button'
          b.addEventListener('click', () => { track('click', 'cta-' + kind); openRequest(kind, { item: it.key, itemName: it.title }) })
          card.append(b)
        }
        grid.append(card)
      }
    }
    if (grid.childNodes.length) { sec.hidden = false; if (typeof watch === 'function' && store.get('lr_consent') === 'yes') watch() }
  }).catch(() => {})

  /* ---------- formularios en la página ---------- */
  function inline(form, run, okText) {
    if (!form) return
    const box = $('.ok', form), btn = $('button[type=submit]', form)
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const say = (t, bad) => { box.textContent = t; box.classList.toggle('err', !!bad); box.hidden = false }
      box.hidden = true; box.textContent = ''
      const body = run(Object.fromEntries(new FormData(form).entries()), say)
      if (!body) return
      btn.disabled = true
      const out = await send(body.path, body.data)
      btn.disabled = false
      if (!out.ok) return say(out.error, true)
      form.reset(); say(okText)
    })
  }
  inline($('#cform'), (v, say) => {
    if (!v.name || v.name.trim().length < 2) return say('Please tell us your name.', true)
    if (!v.contact || v.contact.trim().length < 6) return say('Leave an email or a phone so we can answer.', true)
    if (!v.message || !v.message.trim()) return say('Write your message.', true)
    return { path: '/api/solicitud', data: { kind: 'contacto', name: v.name, message: v.message, language: LANG, website: v.website || '', visitor_id: visitor(), ...splitContact(v.contact) } }
  }, 'Message sent. We will answer shortly.')
  inline($('#nform'), (v, say) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email || '')) return say('That email does not look right.', true)
    return { path: '/api/suscribir', data: { email: v.email, language: LANG, website: v.website || '' } }
  }, 'You are in. Watch your inbox for offers.')
  inline($('#rfp'), (_v, say) => {
    const g = (id) => ($('#' + id)?.value || '').trim()
    if (g('rn').length < 2) return say('Please tell us your names.', true)
    if (!g('re') && !g('rph')) return say('Leave an email or a phone so we can reach you.', true)
    const d = g('rd')
    if (d && d < today()) return say('Choose a future date.', true)
    return { path: '/api/solicitud', data: { kind: 'boda', name: g('rn'), email: g('re'), phone: g('rph'), check_in: d || '', adults: Number(g('rg')) || undefined, item_key: slug(g('rp')), details: { paquete: g('rp') }, message: g('rm'), language: LANG, visitor_id: visitor() } }
  }, 'Request sent. Our events team will contact you with a proposal.')

  /* ---------- clima real ---------- */
  // Primero el servidor del sitio (/api/clima, con caché); si falla, directo a
  // Open-Meteo. Si nada responde con una temperatura, se oculta el recuadro.
  const wxBox = $('#wx-t') && $('#wx-t').closest('.wx')
  const wxGet = (url, pick) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((d) => {
    const v = pick(d); if (!v || typeof v.t !== 'number' || !isFinite(v.t)) throw new Error('sin clima'); return v
  })
  wxGet('/api/clima', (d) => ({ t: d.temperature, w: d.code }))
    .catch(() => wxGet('https://api.open-meteo.com/v1/forecast?latitude=32.2616&longitude=-116.9906&current=temperature_2m,weather_code&timezone=America%2FTijuana', (d) => d && d.current && { t: d.current.temperature_2m, w: d.current.weather_code }))
    .then(({ t, w }) => {
      const label = w === 0 ? 'Clear' : w <= 3 ? 'Partly cloudy' : w <= 48 ? 'Fog' : w <= 67 ? 'Rain' : w <= 77 ? 'Snow' : w <= 82 ? 'Showers' : 'Storm'
      $('#wx-t').textContent = Math.round(t) + '°C'
      $('#wx-s').innerHTML = `Rosarito, K38<br>${T(label)} · ${Math.round(t * 9 / 5 + 32)}°F`
    })
    .catch(() => { if (wxBox) wxBox.hidden = true })

  /* ---------- medición anónima (solo con permiso) ---------- */
  let queue = [], session = null
  const page = () => { const h = location.hash.slice(1); return '/' + (!h || h === 'home' || h === 'contact' ? '' : h.replace(/[^A-Za-z0-9/_-]/g, '')) }
  function track(kind, section, seconds) {
    if (store.get('lr_consent') !== 'yes') return
    const ev = { kind, page: page() }
    if (section) ev.section = section
    if (kind === 'section') ev.seconds = Math.min(3600, Math.round(seconds))
    queue.push(ev); if (queue.length >= 20) flush()
  }
  function flush() {
    if (!queue.length || store.get('lr_consent') !== 'yes') return
    const w = innerWidth
    const body = JSON.stringify({ visitor_id: store.get('lr_vid'), session_id: session, device: w < 700 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop', referrer: document.referrer && !document.referrer.includes(location.host) ? document.referrer : '', events: queue.splice(0, 30) })
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/t', new Blob([body], { type: 'application/json' })))) fetch('/api/t', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
  }
  // Tiempo visible por sección: cuenta mientras la sección ocupa la pantalla y la pestaña está al frente.
  const seen = new Map()
  const closeOut = (key) => { const t = seen.get(key); if (t) { seen.delete(key); const s = (performance.now() - t) / 1000; if (s >= 1) track('section', key, s) } }
  let io = null
  function watch() {
    if (io) io.disconnect()
    ;[...seen.keys()].forEach(closeOut)
    io = new IntersectionObserver((entries) => entries.forEach((en) => {
      const key = en.target.dataset.sec
      if (en.isIntersecting && en.intersectionRatio >= 0.35) { if (!seen.has(key)) seen.set(key, performance.now()) } else closeOut(key)
    }), { threshold: [0, 0.35, 0.7] })
    const home = $('main[data-view="home"]')
    if (home && !home.hidden) { if ($('#hero')) { $('#hero').dataset.sec = 'inicio'; io.observe($('#hero')) } $$('[data-sec]', home).forEach((s) => io.observe(s)) }
    else { const v = $('main[data-view]:not([hidden])'); if (v) { v.dataset.sec = v.dataset.sec || v.dataset.view; io.observe(v) } }
    const c = $('#contact-block'); if (c) io.observe(c)
  }
  function startTracking() {
    if (!store.get('lr_vid')) store.set('lr_vid', rid())
    session = session || rid()
    track('view'); watch()
    addEventListener('hashchange', () => { track('view'); setTimeout(watch, 60) })
    document.addEventListener('visibilitychange', () => { if (document.hidden) { [...seen.keys()].forEach(closeOut); flush() } else watch() })
    addEventListener('pagehide', () => { [...seen.keys()].forEach(closeOut); flush() })
    setInterval(flush, 15000)
  }

  /* ---------- aviso de cookies ---------- */
  function banner() {
    const b = document.createElement('div')
    b.className = 'ck'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Cookies')
    b.innerHTML = `<p>We measure visits anonymously to improve this site. No names, emails or IP addresses. <a href="#privacy">Privacy &amp; cookies</a></p><div class="bt"><button type="button" class="n">Decline</button><button type="button" class="y">Accept</button></div>`
    document.body.appendChild(b)
    $('.y', b).onclick = () => { store.set('lr_consent', 'yes'); b.remove(); startTracking() }
    $('.n', b).onclick = () => { store.set('lr_consent', 'no'); b.remove() }
  }
  const consent = store.get('lr_consent')
  if (consent === 'yes') startTracking(); else if (consent !== 'no') banner()
  document.addEventListener('click', (e) => { if (e.target.closest('[data-cookie-reset]')) { e.preventDefault(); store.del('lr_consent'); if (!$('.ck')) banner() } })
})()
