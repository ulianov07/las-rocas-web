# Las Rocas Resort & Spa: sitio web

Sitio público del hotel. Es una sola página (`public/index.html`) con sus vistas,
más las rutas de servidor que mandan las solicitudes al panel del hotel en Lisa.

## Cómo funciona

```
Visitante -> esta página -> /api/solicitud, /api/suscribir, /api/t, /api/contenido
                                   |  servidor del sitio, con la llave del sitio
                                   v
                         Lisa: /api/sitio/las-rocas/...  ->  panel "Página web"
```

- **Aquí no hay llaves de base de datos.** El servidor del sitio solo conoce la
  llave de su sitio (`SITE_KEY`) y nunca la manda al navegador.
- **La página no confirma ni cobra.** Manda solicitudes (reservación, mesa, spa,
  evento, boda, contacto) y el equipo del hotel las atiende en su panel.
- **Novedades.** Lo que el hotel publica en su panel (eventos, promociones,
  avisos) sale en la sección "Events & offers" del inicio. Con fecha final, se apaga solo.
- **Idiomas.** Inglés por defecto; español con el botón EN · ES (`public/es.js`).
- **Medición anónima.** Solo si el visitante acepta el aviso: páginas vistas y
  tiempo por sección, sin nombre, correo, teléfono ni IP.

## Variables de entorno (Vercel)

| Variable | Valor |
|---|---|
| `LISA_API_URL` | URL de producción del dashboard de Lisa, sin diagonal final |
| `SITE_SLUG` | `las-rocas` |
| `SITE_KEY` | Llave del sitio (Sensitive). Cómo generarla: `docs/sitio/ALTA_SITIO.md` en el repo lisa-ia |

Sin estas variables la página se ve completa, pero los formularios responden que
todavía no están disponibles y muestran el teléfono del hotel.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && node tests/e2e.mjs   # prueba de punta a punta (necesita Playwright)
```

La prueba levanta el sitio contra un Lisa de mentira y recorre cada formulario,
el cambio de idioma, las novedades, el aviso de cookies, el celular y los errores.

## Qué editar

| Para cambiar | Archivo |
|---|---|
| Textos, secciones y diseño | `public/index.html` |
| Formularios, idioma, medición | `public/site.js`, `public/site.css` |
| Traducción al español | `public/es.js` |
| Fotos y video | `public/` |
