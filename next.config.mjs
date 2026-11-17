/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // La página es public/index.html (una sola página con sus vistas); las rutas /api son de Next.
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/index.html' }] }
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      { source: '/:file(.*\\.(?:jpg|png|mp4|svg))', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
    ]
  },
}
export default nextConfig
