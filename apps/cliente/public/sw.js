/**
 * El service worker de la app del cliente: que abra sin conexion.
 *
 * "Las tarjetas y el progreso deben verse sin conexion" (especificacion,
 * seccion 10). Los DATOS ya los resuelve la app, que guarda lo ultimo que vio;
 * esto guarda el ARMAZON —las paginas y sus archivos— para que la app abra
 * aunque no haya red. Por eso las llamadas a la api, que es otro origen, no se
 * tocan: la app decide que mostrar sin conexion, no este archivo.
 *
 * - Paginas: primero la red, para que siempre se vea la version nueva; sin
 *   red, la ultima guardada de esa pagina, o la de inicio.
 * - Archivos de /_next/static/: llevan un hash en el nombre y nunca cambian,
 *   asi que se sirven de lo guardado.
 *
 * Cambiar VERSION descarta todo lo guardado por la anterior.
 */
const VERSION = 'repunto-cliente-v1';
const INICIO = '/';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([INICIO, '/codigo']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((clave) => clave !== VERSION)
            .map((clave) => caches.delete(clave)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  // La api y todo lo de otro origen pasan de largo.
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(primeroLaRed(pedido));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(primeroLoGuardado(pedido));
  }
});

async function primeroLaRed(pedido) {
  const cache = await caches.open(VERSION);
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok) void cache.put(pedido, respuesta.clone());
    return respuesta;
  } catch {
    return (
      (await cache.match(pedido)) ??
      (await cache.match(INICIO)) ??
      new Response('Sin conexión', { status: 503 })
    );
  }
}

async function primeroLoGuardado(pedido) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(pedido);
  if (guardada !== undefined) return guardada;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) void cache.put(pedido, respuesta.clone());
  return respuesta;
}
