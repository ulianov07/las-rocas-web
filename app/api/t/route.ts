import { NextResponse } from 'next/server'
import { forward, readBody, sameOrigin } from '@/lib/lisa'

export const dynamic = 'force-dynamic'

// Medición anónima (solo si el visitante aceptó). El país lo pone el hosting
// (dos letras); no se reenvía la IP. Nunca responde error al navegador.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 204 })
  const body = await readBody(req)
  if (body !== undefined) {
    const country = req.headers.get('x-vercel-ip-country') ?? ''
    await forward('eventos', body, /^[A-Za-z]{2}$/.test(country) ? { 'x-site-country': country } : {})
  }
  return new NextResponse(null, { status: 204 })
}
