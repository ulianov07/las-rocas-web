import { NextResponse } from 'next/server'
import { forward, readBody, sameOrigin, toVisitor } from '@/lib/lisa'

export const dynamic = 'force-dynamic'

// Solicitud de reservación, mesa, spa, evento, boda o contacto. Se manda a Lisa,
// que la valida y la deja en el panel del hotel. Aquí no se guarda nada.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const body = await readBody(req)
  if (body === undefined) return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 })
  const out = toVisitor(await forward('solicitudes', body))
  return NextResponse.json(out.status < 400 ? { ok: true } : out.body, { status: out.status })
}
