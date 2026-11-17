// Prueba de punta a punta del sitio, con un Lisa de mentira que anota lo que recibe.
// Correr con:  npm run build && node tests/e2e.mjs
// Necesita Playwright con Chromium instalado en la máquina (no es dependencia del proyecto).
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const { chromium } = createRequire(import.meta.url)('playwright')
const KEY = 'llave-de-prueba-0123456789abcdef0123456789abcdef'
const LISA = 4310, SITE = 4311
const got = []
let failNext = null

const lisa = createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.headers['x-site-key'] !== KEY) return reply(404, { error: 'not_found' })
    const m = req.url.match(/^\/api\/sitio\/las-rocas\/(\w+)$/)
    if (!m) return reply(404, { error: 'not_found' })
    // Contenido que el hotel publicó en su panel (lo lee el servidor del sitio).
    if (req.method === 'GET' && m[1] === 'contenido') {
      return reply(200, { today: '2026-11-16', rooms: [], sections: { eventos: [{ key: 'gala-de-ano-nuevo', data: { title: 'New Year\'s Eve Gala <b>2027</b>', description: 'Four-course dinner', price: '99 USD', schedule: '8:00 pm' }, ends_on: '2026-12-31' }] } })
    }
    if (failNext) { const f = failNext; failNext = null; return reply(f.status, f.body) }
    got.push({ path: m[1], body: JSON.parse(raw || '{}'), country: req.headers['x-site-country'] ?? null })
    reply(200, { ok: true })
  })
}).listen(LISA)

const site = spawn('npx', ['next', 'start', '-p', String(SITE)], {
  env: { ...process.env, LISA_API_URL: `http://127.0.0.1:${LISA}`, SITE_SLUG: 'las-rocas', SITE_KEY: KEY },
  stdio: ['ignore', 'pipe', 'inherit'],
})
await new Promise((ok, bad) => { site.stdout.on('data', (d) => /Ready|started server/i.test(String(d)) && ok()); site.on('exit', () => bad(new Error('el sitio no arrancó'))) })

const browser = await chromium.launch()
const errors = []
const step = async (name, fn) => { try { await fn(); console.log('ok   ', name) } catch (e) { errors.push(name); console.log('FALLA', name, '\n     ', e.message.split('\n')[0]) } }
const last = (path) => got.filter((g) => g.path === path).at(-1)
const base = `http://127.0.0.1:${SITE}`

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(base + '/')
  const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 20); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) })
  const after = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 23); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) })

  await step('la página carga con su título y sin errores de script', async () => {
    assert.match(await page.title(), /Las Rocas Resort/)
    await page.waitForSelector('nav .book')
    assert.deepEqual(pageErrors, [])
  })

  await step('aviso de cookies: sin aceptar no se mide nada', async () => {
    await page.waitForSelector('.ck')
    await page.waitForTimeout(600)
    assert.equal(got.filter((g) => g.path === 'eventos').length, 0)
  })

  await step('Book Now: valida, y la reservación llega a Lisa con sus datos', async () => {
    await page.click('nav .book')
    await page.waitForSelector('.rqm.on')
    await page.click('.rqm button[type=submit]')
    assert.match(await page.textContent('.rqm .ok'), /name/i)
    await page.fill('.rqm [name=name]', 'Jennifer Walsh')
    await page.fill('.rqm [name=check_in]', tomorrow)
    await page.fill('.rqm [name=check_out]', after)
    await page.fill('.rqm [name=adults]', '2')
    await page.selectOption('.rqm [name=room_key]', 'gaviotas')
    await page.check('.rqm [name=pets]')
    await page.click('.rqm button[type=submit]')
    assert.match(await page.textContent('.rqm .ok'), /phone or an email/i)
    await page.fill('.rqm [name=phone]', '+1 (619) 555-0142')
    await page.fill('.rqm [name=message]', 'Anniversary trip')
    await page.click('.rqm button[type=submit]')
    await page.waitForSelector('.rqm .done')
    const r = last('solicitudes').body
    assert.equal(r.kind, 'reserva'); assert.equal(r.name, 'Jennifer Walsh'); assert.equal(r.check_in, tomorrow); assert.equal(r.check_out, after)
    assert.equal(r.room_key, 'gaviotas'); assert.equal(r.pets, true); assert.equal(r.adults, 2); assert.equal(r.visitor_id, null, 'sin permiso no hay identificador')
    await page.click('.rqm .done button')
    await page.waitForSelector('.rqm', { state: 'detached' })
  })

  await step('Book this room: abre con la habitación de la página', async () => {
    await page.goto(base + '/#room-junior-king')
    await page.click('main[data-view="room"] [data-req="reserva"]')
    await page.waitForSelector('.rqm.on')
    assert.equal(await page.inputValue('.rqm [name=room_key]'), 'junior-king')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.rqm', { state: 'detached' })
  })

  await step('paquete: el nombre del paquete viaja en la solicitud', async () => {
    await page.goto(base + '/#packages')
    await page.click('main[data-view="packages"] article.pk >> nth=1 >> [data-req]')
    await page.waitForSelector('.rqm.on')
    const name = await page.inputValue('.rqm [name=item_name]')
    assert.ok(name.length > 3, name)
    await page.fill('.rqm [name=name]', 'Carlos Méndez'); await page.fill('.rqm [name=check_in]', tomorrow); await page.fill('.rqm [name=check_out]', after)
    await page.fill('.rqm [name=email]', 'carlos@example.com')
    await page.click('.rqm button[type=submit]'); await page.waitForSelector('.rqm .done')
    const r = last('solicitudes').body
    assert.equal(r.details.paquete, name); assert.match(r.item_key, /^[a-z0-9-]+$/)
    await page.click('.rqm .done button')
  })

  await step('Reserve a table: llega como mesa con lugar y hora', async () => {
    await page.goto(base + '/#dining-palapa')
    await page.click('main[data-view="dining"] [data-req="mesa"]')
    await page.waitForSelector('.rqm.on')
    assert.equal(await page.inputValue('.rqm [name=item_key]'), 'palapa')
    await page.fill('.rqm [name=date]', tomorrow); await page.fill('.rqm [name=time]', '20:30'); await page.fill('.rqm [name=adults]', '4')
    await page.fill('.rqm [name=name]', 'Sofía Navarro'); await page.fill('.rqm [name=phone]', '6641234567')
    await page.click('.rqm button[type=submit]'); await page.waitForSelector('.rqm .done')
    const r = last('solicitudes').body
    assert.equal(r.kind, 'mesa'); assert.equal(r.item_key, 'palapa'); assert.equal(r.details.hora, '20:30'); assert.equal(r.adults, 4)
    await page.click('.rqm .done button')
  })

  await step('Book a treatment: llega como spa', async () => {
    await page.goto(base + '/#spa-massages')
    await page.click('main[data-view="spa"] [data-req="spa"] >> nth=0')
    await page.waitForSelector('.rqm.on')
    await page.fill('.rqm [name=date]', tomorrow); await page.fill('.rqm [name=name]', 'Emily Johnson'); await page.fill('.rqm [name=email]', 'emily@example.com')
    await page.click('.rqm button[type=submit]'); await page.waitForSelector('.rqm .done')
    assert.equal(last('solicitudes').body.kind, 'spa')
    await page.click('.rqm .done button')
  })

  await step('bodas: el formulario de propuesta llega como boda', async () => {
    await page.goto(base + '/#weddings')
    await page.fill('#rn', 'Andrea & Luis'); await page.fill('#re', 'andrea@example.com'); await page.fill('#rph', '+52 664 555 2231'); await page.fill('#rg', '120'); await page.fill('#rm', 'Sunset ceremony')
    await page.click('#rfp button[type=submit]')
    await page.waitForFunction(() => { const o = document.querySelector('#rfp-ok'); return o && !o.hidden })
    assert.match(await page.textContent('#rfp-ok'), /events team/)
    const r = last('solicitudes').body
    assert.equal(r.kind, 'boda'); assert.equal(r.adults, 120); assert.ok(r.details.paquete)
  })

  await step('idioma: ES traduce la página y los formularios; EN regresa', async () => {
    await page.goto(base + '/')
    await page.click('nav [data-lang="es"]')
    await page.waitForFunction(() => document.documentElement.lang === 'es')
    assert.match(await page.textContent('nav .book'), /Reservar/i)
    await page.click('nav .book'); await page.waitForSelector('.rqm.on')
    assert.match(await page.textContent('.rqm h2'), /Solicita tu estancia/)
    await page.click('.rqm button[type=submit]')
    assert.match(await page.textContent('.rqm .ok'), /nombre/i)
    await page.keyboard.press('Escape'); await page.waitForSelector('.rqm', { state: 'detached' })
    await page.click('nav [data-lang="en"]')
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    assert.match(await page.textContent('nav .book'), /Book/i)
  })

  await step('contacto y boletín', async () => {
    await page.goto(base + '/#contact')
    await page.fill('#cform [name=name]', 'Ana Ríos'); await page.fill('#cform [name=contact]', 'ana@example.com'); await page.fill('#cform [name=message]', 'Do you have parking?')
    await page.click('#cform button[type=submit]')
    await page.waitForFunction(() => !document.querySelector('#cform .ok').hidden)
    const c = last('solicitudes').body
    assert.equal(c.kind, 'contacto'); assert.equal(c.email, 'ana@example.com')
    await page.fill('#nform [name=email]', 'ana@example.com'); await page.click('#nform button[type=submit]')
    await page.waitForFunction(() => !document.querySelector('#nform .ok').hidden)
    assert.equal(last('suscriptores').body.email, 'ana@example.com')
  })

  await step('novedades: lo que el hotel publica en su panel sale en la página y se puede pedir', async () => {
    await page.goto(base + '/')
    await page.waitForSelector('#news:not([hidden]) .nw')
    assert.equal(await page.textContent('#news .nw h3'), "New Year's Eve Gala <b>2027</b>", 'el título se pinta como texto, no como HTML')
    assert.equal(await page.locator('#news .nw h3 b').count(), 0)
    await page.click('#news .nw button')
    await page.waitForSelector('.rqm.on')
    await page.fill('.rqm [name=name]', 'Daniel Reyes'); await page.fill('.rqm [name=phone]', '+52 664 555 9013'); await page.fill('.rqm [name=adults]', '2'); await page.fill('.rqm [name=children]', '1')
    await page.click('.rqm button[type=submit]'); await page.waitForSelector('.rqm .done')
    const r = last('solicitudes').body
    assert.equal(r.kind, 'evento'); assert.equal(r.item_key, 'gala-de-ano-nuevo'); assert.equal(r.children, 1); assert.match(r.details.evento, /Gala/)
    await page.click('.rqm .done button')
  })

  await step('si Lisa rechaza o falla, el visitante ve un mensaje claro y nada se pierde en silencio', async () => {
    failNext = { status: 400, body: { error: 'El teléfono no es válido' } }
    await page.goto(base + '/#contact')
    await page.fill('#cform [name=name]', 'Ana Ríos'); await page.fill('#cform [name=contact]', '123456789'); await page.fill('#cform [name=message]', 'Hola')
    await page.click('#cform button[type=submit]')
    await page.waitForFunction(() => !document.querySelector('#cform .ok').hidden)
    assert.match(await page.textContent('#cform .ok'), /phone number/i)
    failNext = { status: 503, body: { error: 'x' } }
    await page.click('#cform button[type=submit]')
    await page.waitForFunction(() => /call us/i.test(document.querySelector('#cform .ok').textContent))
  })

  await step('al aceptar cookies se mide la visita y el tiempo por sección, sin datos personales', async () => {
    await page.goto(base + '/')
    await page.click('.ck .y')
    await page.waitForTimeout(1300)
    await page.evaluate(() => document.querySelector('[data-sec="habitaciones"]').scrollIntoView())
    await page.waitForTimeout(1500)
    await page.evaluate(() => { location.hash = '#spa' })
    await page.waitForTimeout(1300)
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await page.waitForTimeout(500)
    const events = got.filter((g) => g.path === 'eventos').flatMap((g) => g.body.events)
    assert.ok(events.some((e) => e.kind === 'view' && e.page === '/'), 'vista del inicio')
    assert.ok(events.some((e) => e.kind === 'view' && e.page === '/spa'), 'vista de spa')
    assert.ok(events.some((e) => e.kind === 'section' && e.section === 'inicio' && e.seconds >= 1), 'tiempo en el inicio')
    assert.ok(events.some((e) => e.kind === 'section' && e.section === 'habitaciones'), 'tiempo en habitaciones')
    const batch = last('eventos').body
    assert.match(batch.visitor_id, /^[A-Za-z0-9-]{8,64}$/); assert.equal(batch.device, 'desktop')
    assert.ok(!JSON.stringify(batch).match(/@|\+1|Walsh/), 'sin datos personales')
  })

  await step('celular: la ventana de reservación cabe y no hay scroll horizontal', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 800 } })
    const p = await m.newPage()
    await p.goto(base + '/')
    await p.click('.ck .n')
    await p.click('nav .book')
    await p.waitForSelector('.rqm.on')
    const box = await p.locator('.rqm .box').boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= 390, JSON.stringify(box))
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/movil-reserva.png' : '/dev/null' }).catch(() => {})
    await m.close()
  })

  await step('otro sitio no puede usar las rutas desde un navegador', async () => {
    const res = await fetch(base + '/api/solicitud', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://otro-sitio.example' }, body: '{}' })
    assert.equal(res.status, 403)
  })

  if (process.env.SHOT_DIR) {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(base + '/#room-gaviotas'); await page.click('main[data-view="room"] [data-req="reserva"]'); await page.waitForSelector('.rqm.on'); await page.waitForTimeout(500)
    await page.screenshot({ path: process.env.SHOT_DIR + '/reserva.png' })
    await page.keyboard.press('Escape'); await page.goto(base + '/#contact'); await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOT_DIR + '/contacto.png' })
  }
} finally {
  await browser.close(); site.kill(); lisa.close()
}
console.log(errors.length ? `\n${errors.length} paso(s) fallaron` : '\nTodo en verde')
process.exit(errors.length ? 1 : 0)
