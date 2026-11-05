import {
  type DatosDelLocal,
  type FichaDelNegocio,
  LIMITES_DEL_LOCAL,
  type LocalDelAdmin,
  esquemaDatosDelLocal,
} from '@repunto/contratos';

/**
 * Los locales en la ficha del negocio: que se puede mandar y que hay que
 * decirle al admin antes de cerrar uno. Lo que decide si se puede, lo decide
 * la api.
 */

export interface BorradorDeLocal {
  nombre: string;
  direccion: string;
}

export const LOCAL_VACIO: Readonly<BorradorDeLocal> = { nombre: '', direccion: '' };

export function borradorDeLocal(l: LocalDelAdmin): BorradorDeLocal {
  return { nombre: l.nombre, direccion: l.direccion };
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

  if (Object.keys(problemas).length > 0) return { ok: false, problemas };
  const datos = esquemaDatosDelLocal.safeParse({ nombre, direccion });
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
  ficha: FichaDelNegocio,
  local: LocalDelAdmin,
): string {
  const otrosAbiertos = ficha.locales.filter((l) => l.activo && l.id !== local.id);
  return otrosAbiertos.length === 0
    ? 'Tocá de nuevo: es el último abierto y el negocio sale de "Dónde juntar sellos"'
    : 'Tocá de nuevo: sus tablets dejan de sellar';
}
