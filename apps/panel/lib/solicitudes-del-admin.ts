import { type SolicitudDelAdmin, esRubroDeNegocio } from '@repunto/contratos';

import { BORRADOR_INICIAL, type Borrador } from './alta-de-negocio';
import { telefonoParaVer } from './personas-del-admin';

/**
 * Las solicitudes de negocio en el panel del admin: cómo se separan, cómo se
 * le contesta a quien pidió, y el alta que arranca de una.
 */

export function separarSolicitudes(solicitudes: readonly SolicitudDelAdmin[]): {
  pendientes: SolicitudDelAdmin[];
  resueltas: SolicitudDelAdmin[];
} {
  return {
    pendientes: solicitudes.filter((s) => s.estado === 'pendiente'),
    resueltas: solicitudes.filter((s) => s.estado !== 'pendiente'),
  };
}

/** El alta, ya completa con lo que se sabe: el nombre y el rubro. */
export function borradorDesdeSolicitud(s: SolicitudDelAdmin): Borrador {
  return {
    ...BORRADOR_INICIAL,
    nombre: s.nombre_negocio,
    categoria: esRubroDeNegocio(s.categoria) ? s.categoria : '',
  };
}

/** El primer mensaje a quien pidió: el admin lo edita en WhatsApp antes de mandarlo. */
export function mensajeParaQuienPidio(s: SolicitudDelAdmin): string {
  const nombre = s.contacto.trim().split(/\s+/)[0] ?? s.contacto;
  return `¡Hola ${nombre}! Te escribimos de Repunto por tu solicitud para sumar ${s.nombre_negocio}. ¿Cuándo te queda bien para conversar?`;
}

/** El chat de WhatsApp con quien pidió, con el mensaje escrito. */
export function chatConQuienPidio(s: SolicitudDelAdmin): string {
  const digitos = s.telefono.replace(/\D/g, '');
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensajeParaQuienPidio(s))}`;
}

/** Lo que hay que hacer después del alta, que el alta no hace sola. */
export function pasoSiguienteDelAlta(s: SolicitudDelAdmin): string {
  return `Después de darlo de alta, cargá a ${s.contacto} como dueño, con el teléfono ${telefonoParaVer(s.telefono)}, en "Personas" de la ficha.`;
}

export const TITULOS_DE_ESTADO: Readonly<Record<SolicitudDelAdmin['estado'], string>> = {
  pendiente: 'Pendiente',
  aprobada: 'Dada de alta',
  rechazada: 'Rechazada',
};
