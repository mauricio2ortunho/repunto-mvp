import { AsyncLocalStorage } from 'node:async_hooks';

import type { CajaLeida } from '../caja/caja.sql';

/**
 * Lo que se sabe del pedido en curso: su `request_id` y los ids que fue
 * resolviendo. Sale en la linea de log del pedido y en la bitacora de la caja
 * (CLAUDE.md, seccion 8).
 *
 * Vive en AsyncLocalStorage, que viene con Node: cada pedido tiene el suyo y
 * lo sigue a traves de los await, sin pasarlo de mano en mano por cada
 * servicio. No es estado del proceso: muere con el pedido.
 *
 * Solo ids y codigos. Nunca el codigo rotativo, la semilla, el PIN ni un
 * token: por eso los campos estan nombrados uno por uno y no es un
 * Record<string, unknown>.
 */
export interface CamposDelPedido {
  dispositivo_id?: string;
  local_id?: string;
  turno_id?: string;
  cliente_id?: string;
  tarjeta_id?: string;
  sello_id?: string;
  registro_id?: string;
  /** El codigo con que se rechazo, si se rechazo. */
  codigo?: string;
}

export interface ContextoDelPedido {
  request_id: string;
  campos: CamposDelPedido;
}

const almacen = new AsyncLocalStorage<ContextoDelPedido>();

/** Corre `seguir` con ese contexto. Lo usa el middleware, una vez por pedido. */
export function conContexto<T>(contexto: ContextoDelPedido, seguir: () => T): T {
  return almacen.run(contexto, seguir);
}

export function contextoActual(): ContextoDelPedido | undefined {
  return almacen.getStore();
}

/**
 * Suma ids al pedido en curso. Fuera de un pedido —un script, un test que
 * llama al servicio directo— no hace nada.
 */
export function anotar(campos: CamposDelPedido): void {
  const contexto = almacen.getStore();
  if (contexto === undefined) return;
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor !== undefined) Object.assign(contexto.campos, { [clave]: valor });
  }
}

/** Lo que dice la lectura de la caja: de que tablet, en que local, con que turno. */
export function anotarCaja(
  caja: Pick<CajaLeida, 'dispositivo' | 'local' | 'turno'>,
): void {
  anotar({
    dispositivo_id: caja.dispositivo.id,
    local_id: caja.local.id,
    turno_id: caja.turno?.id,
  });
}
