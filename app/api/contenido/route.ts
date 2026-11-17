import { NextResponse } from 'next/server'
import { liveContent } from '@/lib/lisa'

export const dynamic = 'force-dynamic'

// Lo que el hotel publica desde su panel (eventos, promociones, avisos). Se lee
// de Lisa con la llave del sitio y se guarda un minuto en memoria del servidor.
// Si Lisa no responde, la página simplemente no muestra la sección.
export async function GET() {
  return NextResponse.json({ sections: await liveContent() }, { headers: { 'Cache-Control': 'public, max-age=30' } })
}
