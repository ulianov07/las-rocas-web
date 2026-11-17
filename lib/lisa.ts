// Puente entre este sitio y el dashboard de Lisa. SOLO servidor: la llave del
// sitio (SITE_KEY) vive en variables de entorno y nunca llega al navegador.
// Aquí no hay llaves de base de datos: Lisa valida y guarda.

const MAX_BODY_BYTES = 20_000

type Forwarded = { status: number; body: unknown }

export function siteConfig(): { url: string; slug: string; key: string } | null {
  const url = (process.env.LISA_API_URL ?? '').trim().replace(/\/+$/, '')
  const slug = (process.env.SITE_SLUG ?? '').trim()
  const key = (process.env.SITE_KEY ?? '').trim()
  return url && slug && key ? { url, slug, key } : null
}

// El formulario tiene que venir de esta misma página: otro sitio no puede usar estas rutas desde un navegador.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // navegadores viejos y sendBeacon de la misma página no siempre lo mandan
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))
  } catch {
    return false
  }
}

export async function readBody(req: Request): Promise<unknown | undefined> {
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return undefined
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function forward(path: 'solicitudes' | 'suscriptores' | 'eventos', body: unknown, extraHeaders: Record<string, string> = {}): Promise<Forwarded> {
  const cfg = siteConfig()
  if (!cfg) return { status: 503, body: { error: 'This form is not available yet. Please call us at 1 866 445 8909.' } }
  try {
    const res = await fetch(`${cfg.url}/api/sitio/${cfg.slug}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': cfg.key, ...extraHeaders },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const out = await res.json().catch(() => ({}))
    // 404 = llave o sitio mal configurados; al visitante no se le explica.
    if (res.status === 404 || res.status >= 500) {
      console.error(`[sitio] Lisa respondió ${res.status} en ${path}`)
      return { status: 502, body: { error: 'We could not send it right now. Please try again or call us at 1 866 445 8909.' } }
    }
    return { status: res.status, body: out }
  } catch (e) {
    console.error(`[sitio] sin respuesta de Lisa en ${path}:`, e instanceof Error ? e.message : e)
    return { status: 502, body: { error: 'We could not send it right now. Please try again or call us at 1 866 445 8909.' } }
  }
}

// Mensajes de Lisa (en español) -> lo que ve el visitante (en inglés).
const MESSAGES: [RegExp, string][] = [
  [/teléfono o un correo/, 'Leave a phone or an email so we can reach you.'],
  [/teléfono no es válido/, 'That phone number does not look right.'],
  [/correo no es válido/, 'That email does not look right.'],
  [/Escribe tu nombre/, 'Please tell us your name.'],
  [/llegada ya pasó/, 'The arrival date is in the past.'],
  [/fecha de llegada/, 'Choose a valid arrival date.'],
  [/fecha de salida|salida debe/, 'Departure must be after arrival.'],
  [/fechas de llegada y salida/, 'Choose your arrival and departure dates.'],
  [/noches/, 'For very long stays, please contact us directly.'],
  [/adultos/, 'Tell us how many adults are coming.'],
  [/niños/, 'The number of children does not look right.'],
  [/Ya recibimos tu solicitud/, 'We already received your request. We will contact you shortly.'],
]

export function toVisitor(result: Forwarded): Forwarded {
  const body = result.body as { error?: unknown } | null
  // Solo se traducen los rechazos de validación (4xx); un fallo del servicio ya trae su mensaje para el visitante.
  if (result.status < 400 || result.status >= 500 || !body || typeof body.error !== 'string') return result
  const hit = MESSAGES.find(([re]) => re.test(body.error as string))
  return { status: result.status, body: { error: hit ? hit[1] : 'Please check the form and try again.' } }
}

// ---------- Contenido que el hotel publica desde su panel ----------
export type ContentCard = { key: string; title: string; description: string; price: string; schedule: string; endsOn: string | null }
type Sections = Record<string, ContentCard[]>

const CONTENT_TTL_MS = 60_000
let cache: { at: number; sections: Sections } | null = null

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

// Solo texto plano y campos conocidos: lo que llega se pinta como texto, nunca como HTML.
export function cleanSections(raw: unknown): Sections {
  const out: Sections = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [section, items] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z]{2,20}$/.test(section) || !Array.isArray(items)) continue
    const cards = items.slice(0, 30).flatMap((it) => {
      const item = it as { key?: unknown; data?: Record<string, unknown>; ends_on?: unknown }
      const title = str(item?.data?.title, 120)
      if (!title || typeof item.key !== 'string') return []
      return [{ key: item.key, title, description: str(item.data?.description, 1200), price: str(item.data?.price, 80), schedule: str(item.data?.schedule, 200), endsOn: typeof item.ends_on === 'string' ? item.ends_on : null }]
    })
    if (cards.length) out[section] = cards
  }
  return out
}

export async function liveContent(now = Date.now()): Promise<Sections> {
  if (cache && now - cache.at < CONTENT_TTL_MS) return cache.sections
  const cfg = siteConfig()
  if (!cfg) return {}
  try {
    const res = await fetch(`${cfg.url}/api/sitio/${cfg.slug}/contenido`, { headers: { 'x-site-key': cfg.key }, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
    if (!res.ok) throw new Error(`Lisa respondió ${res.status}`)
    const body = (await res.json()) as { sections?: unknown }
    cache = { at: now, sections: cleanSections(body.sections) }
    return cache.sections
  } catch (e) {
    console.error('[sitio] contenido no disponible:', e instanceof Error ? e.message : e)
    return cache?.sections ?? {}
  }
}
