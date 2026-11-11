import {
  LIMITES_DE_SOLICITUD,
  type SolicitudNueva,
  esquemaSolicitudNueva,
} from '@repunto/contratos';

/**
 * El formulario "Sumá tu negocio": lo que se escribe y qué falta antes de
 * mandarlo. Que el teléfono sea un teléfono lo decide la api
 * (TELEFONO_INVALIDO): normalizarlo es del dominio, que la app no importa.
 */

export interface BorradorDeSolicitud {
  nombre_negocio: string;
  categoria: string;
  contacto: string;
  telefono: string;
  mensaje: string;
}

export type CampoDeSolicitud = keyof BorradorDeSolicitud;

export const SOLICITUD_VACIA: BorradorDeSolicitud = {
  nombre_negocio: '',
  categoria: '',
  contacto: '',
  telefono: '',
  mensaje: '',
};

export { LIMITES_DE_SOLICITUD };

const QUE_FALTA: Record<Exclude<CampoDeSolicitud, 'mensaje'>, string> = {
  nombre_negocio: 'Escribí el nombre del negocio.',
  categoria: 'Elegí de qué es el negocio.',
  contacto: 'Escribí tu nombre.',
  telefono: 'Escribí tu número de celular.',
};

export type RevisionDeSolicitud =
  | { ok: true; cuerpo: SolicitudNueva }
  | { ok: false; problemas: Partial<Record<CampoDeSolicitud, string>> };

export function revisarSolicitud(b: BorradorDeSolicitud): RevisionDeSolicitud {
  const problemas: Partial<Record<CampoDeSolicitud, string>> = {};
  for (const campo of Object.keys(QUE_FALTA) as (keyof typeof QUE_FALTA)[]) {
    if (b[campo].trim() === '') problemas[campo] = QUE_FALTA[campo];
  }
  if (Object.keys(problemas).length > 0) return { ok: false, problemas };

  const cuerpo = {
    nombre_negocio: b.nombre_negocio.trim(),
    categoria: b.categoria,
    contacto: b.contacto.trim(),
    telefono: b.telefono.trim(),
    mensaje: b.mensaje.trim() === '' ? null : b.mensaje.trim(),
  };
  // El mismo esquema que la api: lo que pase acá, allá también.
  const valida = esquemaSolicitudNueva.safeParse(cuerpo);
  if (!valida.success) {
    return { ok: false, problemas: { categoria: 'Elegí de qué es el negocio.' } };
  }
  return { ok: true, cuerpo: valida.data };
}
