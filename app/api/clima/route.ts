import { NextResponse } from 'next/server'

// Clima de Rosarito (K38) para el recuadro del inicio. Se pide desde el
// servidor (no desde el navegador del visitante, donde un bloqueador o la red
// pueden cortarlo) y se guarda 10 minutos. Si Open-Meteo no responde, la
// página oculta el recuadro en vez de mostrar "--°C".
export const revalidate = 600

const URL_CLIMA =
  'https://api.open-meteo.com/v1/forecast?latitude=32.2616&longitude=-116.9906&current=temperature_2m,weather_code&timezone=America%2FTijuana'

export async function GET() {
  try {
    const r = await fetch(URL_CLIMA, { next: { revalidate: 600 }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(String(r.status))
    const d = (await r.json()) as { current?: { temperature_2m?: unknown; weather_code?: unknown } }
    const t = d.current?.temperature_2m
    const w = d.current?.weather_code
    if (typeof t !== 'number' || !Number.isFinite(t)) throw new Error('sin temperatura')
    return NextResponse.json(
      { temperature: t, code: typeof w === 'number' ? w : 0 },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } },
    )
  } catch {
    return NextResponse.json({ temperature: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
