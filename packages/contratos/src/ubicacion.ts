import { z } from 'zod';

/**
 * Donde esta cada local en el mapa. La marca el admin al cargarlo y el
 * cliente la usa para llegar. Es opcional: sin ella, "Como llegar" busca la
 * direccion escrita.
 *
 * Lo que sale de aca no necesita clave de Google ni cuesta nada: son enlaces
 * que abre la app de Google Maps del telefono. El mapa dentro de la app, que
 * si pide clave, se suma despues sobre los mismos datos.
 */

/** Seis decimales son unos diez centimetros: mas no se distingue en un mapa. */
const DECIMALES = 6;

export const esquemaUbicacion = z.object({
  latitud: z.number().min(-90).max(90),
  longitud: z.number().min(-180).max(180),
});

export type Ubicacion = z.infer<typeof esquemaUbicacion>;

export type LecturaDeUbicacion =
  | { ok: true; ubicacion: Ubicacion }
  | {
      ok: false;
      /**
       * `enlace_corto`: un maps.app.goo.gl, que no trae las coordenadas
       * adentro, y abrirlo desde aca pediria salir a internet.
       */
      motivo: 'vacia' | 'enlace_corto' | 'ilegible' | 'fuera_de_rango';
    };

const NUMERO = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/**
 * Lo que se busca en un enlace largo de Google Maps, del mas preciso al
 * menos. `!3d…!4d…` es el pin del lugar; `@lat,lng` es el centro de la
 * pantalla, que casi siempre coincide pero no siempre.
 */
const EN_ENLACES = [
  new RegExp(String.raw`!3d${NUMERO}!4d${NUMERO}`),
  new RegExp(
    String.raw`[?&](?:q|query|ll|destination|center)=${NUMERO}(?:,|%2C)\s*${NUMERO}`,
    'i',
  ),
  new RegExp(String.raw`@${NUMERO},${NUMERO}`),
];

/** "-17.783312, -63.182104", como lo copia Google Maps; con o sin paréntesis. */
const COORDENADAS = new RegExp(String.raw`^\(?\s*${NUMERO}\s*[,;\s]\s*${NUMERO}\s*\)?$`);

/** "-17,783312 -63,182104": con coma decimal, separadas por espacio o punto y coma. */
const CON_COMA_DECIMAL = /^\(?\s*(-?\d{1,3},\d+)\s*[;\s]\s*(-?\d{1,3},\d+)\s*\)?$/;

/**
 * Lee la ubicacion de lo que el admin pega: las coordenadas que copia de
 * Google Maps, o el enlace largo de la barra del navegador.
 */
export function leerUbicacion(texto: string): LecturaDeUbicacion {
  const limpio = texto.trim();
  if (limpio === '') return { ok: false, motivo: 'vacia' };
  if (/(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(limpio)) {
    return { ok: false, motivo: 'enlace_corto' };
  }

  const par =
    EN_ENLACES.map((patron) => patron.exec(limpio)).find((m) => m !== null) ??
    COORDENADAS.exec(limpio) ??
    CON_COMA_DECIMAL.exec(limpio);
  if (par === null || par === undefined) return { ok: false, motivo: 'ilegible' };

  const ubicacion = {
    latitud: redondear(Number((par[1] ?? '').replace(',', '.'))),
    longitud: redondear(Number((par[2] ?? '').replace(',', '.'))),
  };
  const valida = esquemaUbicacion.safeParse(ubicacion);
  return valida.success
    ? { ok: true, ubicacion: valida.data }
    : { ok: false, motivo: 'fuera_de_rango' };
}

/** Para mostrarla y volver a editarla: "-17.783312, -63.182104". */
export function textoDeUbicacion(u: Ubicacion): string {
  return `${u.latitud}, ${u.longitud}`;
}

/** Abre Google Maps con el pin en ese punto: para revisar que quedo bien. */
export function enlaceDelMapa(u: Ubicacion): string {
  return `https://www.google.com/maps/search/?api=1&query=${u.latitud},${u.longitud}`;
}

/**
 * "Como llegar": abre Google Maps con el recorrido hasta el local, en la app
 * si el telefono la tiene. Sin ubicacion marcada, busca la direccion escrita
 * en Santa Cruz: menos precisa, pero mejor que nada.
 */
export function enlaceParaLlegar(local: {
  ubicacion: Ubicacion | null;
  direccion: string;
}): string {
  const destino =
    local.ubicacion === null
      ? encodeURIComponent(`${local.direccion}, Santa Cruz de la Sierra, Bolivia`)
      : `${local.ubicacion.latitud},${local.ubicacion.longitud}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
}

function redondear(n: number): number {
  const factor = 10 ** DECIMALES;
  return Math.round(n * factor) / factor;
}
