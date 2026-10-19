import type { CausaIncierta } from './http';

/**
 * Lo que la API no puede decir porque no llego a contestar.
 *
 * Los rechazos traen su `mensaje` escrito para el cajero. Un corte no trae
 * nada, y es el caso donde el cajero mas tiende a equivocarse: cree que fallo,
 * vuelve a tipear, y no sabe si sello dos veces. El texto le dice que tocar y
 * le saca ese miedo, que es cierto mientras viaje la misma clave.
 */

export type Accion =
  | 'sellar'
  | 'canjear'
  | 'confirmar'
  | 'descartar'
  | 'anular'
  | 'abrir_turno'
  | 'cerrar_turno';

const QUE_PASO: Record<CausaIncierta, string> = {
  sin_conexion: 'No hay conexión con el servidor.',
  tiempo: 'El servidor tardó demasiado en contestar.',
  servidor: 'El servidor tuvo un problema.',
  respuesta_ilegible: 'La caja no entendió la respuesta del servidor.',
};

const QUE_HACER: Record<Accion, string> = {
  sellar: 'Tocá Sellar de nuevo: si ya se había sellado, no se sella dos veces.',
  canjear:
    'Tocá Entregar premio de nuevo: si ya se había entregado, no se entrega dos veces.',
  confirmar:
    'Tocá el mismo botón de nuevo: si ya se había confirmado, no se confirma dos veces.',
  descartar: 'Tocá Descartar de nuevo.',
  anular:
    'Tocá Deshacer sello de nuevo: si ya se había deshecho, no se deshace dos veces.',
  abrir_turno:
    'Escribí el PIN de nuevo: si el turno ya se había abierto, no se abre dos.',
  cerrar_turno: 'Tocá Cerrar turno de nuevo.',
};

export function mensajeIncierto(causa: CausaIncierta, accion: Accion): string {
  if (causa === 'respuesta_ilegible') {
    return `${QUE_PASO[causa]} Avisá al dueño antes de volver a intentar.`;
  }
  return `${QUE_PASO[causa]} ${QUE_HACER[accion]}`;
}
