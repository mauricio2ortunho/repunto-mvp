import {
  type DatosDelLocal,
  type FichaDelNegocio,
  LIMITES_DEL_LOCAL,
  type LecturaDeUbicacion,
  type LocalDelAdmin,
  type Ubicacion,
  enlaceDelMapa,
  esquemaDatosDelLocal,
  leerUbicacion,
  textoDeUbicacion,
} from '@repunto/contratos';

/**
 * Los locales en la ficha del negocio: que se puede mandar y que hay que
 * decirle al admin antes de cerrar uno. Lo que decide si se puede, lo decide
 * la api.
 */

export interface BorradorDeLocal {
  nombre: string;
  direccion: string;
  /** Lo que se pegó o tipeó: coordenadas o un enlace de Google Maps. Opcional. */
  ubicacion: string;
}

export const LOCAL_VACIO: Readonly<BorradorDeLocal> = {
  nombre: '',
  direccion: '',
  ubicacion: '',
};

export function borradorDeLocal(l: LocalDelAdmin): BorradorDeLocal {
  return {
    nombre: l.nombre,
    direccion: l.direccion,
    ubicacion: l.ubicacion === null ? '' : textoDeUbicacion(l.ubicacion),
  };
}

type MotivoIlegible = Exclude<LecturaDeUbicacion, { ok: true }>['motivo'];

const POR_QUE_NO_SE_LEE: Record<MotivoIlegible, string> = {
  vacia: '',
  enlace_corto:
    'Ese enlace corto no trae la ubicación. En Google Maps, mantené apretado sobre el local y copiá los números que aparecen.',
  ilegible:
    'No la entendemos. Pegá los números que copia Google Maps, como -17.7833, -63.1821.',
  fuera_de_rango: 'Esos números no son una ubicación. Revisá que estén bien copiados.',
};

/**
 * Lo que se muestra debajo del campo mientras se escribe: el enlace para
 * revisar el punto en Google Maps, y un aviso si quedó lejos de Bolivia,
 * que casi siempre es la latitud y la longitud al revés.
 */
export function vistaDeUbicacion(texto: string): {
  enlace: string | null;
  aviso: string | null;
} {
  const lectura = leerUbicacion(texto);
  if (!lectura.ok) return { enlace: null, aviso: null };
  return {
    enlace: enlaceDelMapa(lectura.ubicacion),
    aviso: enBolivia(lectura.ubicacion)
      ? null
      : 'Ese punto queda fuera de Bolivia. ¿Están al revés? Primero va el que empieza con -1 o -2.',
  };
}

/** Un rectángulo que contiene a Bolivia, con margen: no es la frontera. */
function enBolivia(u: Ubicacion): boolean {
  return (
    u.latitud >= -23.5 && u.latitud <= -9.5 && u.longitud >= -70 && u.longitud <= -57
  );
}

export type RevisionDeLocal =
  | { ok: true; peticion: DatosDelLocal }
  | { ok: false; problemas: Partial<Record<keyof BorradorDeLocal, string>> };

export function revisarLocal(b: BorradorDeLocal): RevisionDeLocal {
  const problemas: Partial<Record<keyof BorradorDeLocal, string>> = {};

  const nombre = b.nombre.trim();
  if (nombre === '') problemas.nombre = 'Escribí el nombre del local, como "Centro".';
  else if (nombre.length > LIMITES_DEL_LOCAL.nombre) {
    problemas.nombre = `Hasta ${LIMITES_DEL_LOCAL.nombre} letras.`;
  }

  const direccion = b.direccion.trim();
  if (direccion === '') problemas.direccion = 'Escribí la dirección.';
  else if (direccion.length > LIMITES_DEL_LOCAL.direccion) {
    problemas.direccion = `Hasta ${LIMITES_DEL_LOCAL.direccion} letras.`;
  }

  const lectura = leerUbicacion(b.ubicacion);
  if (!lectura.ok && lectura.motivo !== 'vacia') {
    problemas.ubicacion = POR_QUE_NO_SE_LEE[lectura.motivo];
  }

  if (Object.keys(problemas).length > 0) return { ok: false, problemas };
  const datos = esquemaDatosDelLocal.safeParse({
    nombre,
    direccion,
    ubicacion: lectura.ok ? lectura.ubicacion : null,
  });
  return datos.success
    ? { ok: true, peticion: datos.data }
    : { ok: false, problemas: { nombre: 'Revisá los datos del local.' } };
}

/**
 * El segundo toque de "Cerrar", con lo que pasa al confirmarlo. Si es el
 * ultimo abierto, el negocio entero desaparece de "Donde juntar sellos", y
 * eso no es obvio desde la fila de un local.
 */
export function confirmacionDeCierre(
  ficha: Pick<FichaDelNegocio, 'locales'>,
  local: LocalDelAdmin,
): string {
  const otrosAbiertos = ficha.locales.filter((l) => l.activo && l.id !== local.id);
  return otrosAbiertos.length === 0
    ? 'Tocá de nuevo: es el último abierto y el negocio sale de "Dónde juntar sellos"'
    : 'Tocá de nuevo: sus tablets dejan de sellar';
}
