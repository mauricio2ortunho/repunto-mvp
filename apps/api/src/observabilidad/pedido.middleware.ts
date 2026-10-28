import { randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';

import { type ContextoDelPedido, conContexto } from './contexto';

/** Lo minimo de Express que usa el middleware. */
interface Peticion {
  method: string;
  originalUrl: string;
}
interface Respuesta {
  statusCode: number;
  setHeader(nombre: string, valor: string): void;
  on(evento: 'finish', escuchar: () => void): void;
}

/** La cabecera con que el pedido vuelve: el panel la puede mostrar en un error. */
export const CABECERA_REQUEST_ID = 'X-Request-Id';

/**
 * Un `request_id` por pedido, y al terminar una linea JSON con lo que paso
 * (CLAUDE.md, seccion 8).
 *
 * El id lo genera la api, no lo toma del pedido: un id que manda el cliente
 * puede repetirse o traer cualquier cosa, y es el que se busca en la
 * bitacora.
 *
 * La linea lleva la ruta sin la query —ninguna credencial viaja en la URL,
 * pero tampoco hace falta mirarla—, el estado, cuanto tardo y los ids que el
 * pedido fue anotando. Nunca el cuerpo. Los preflight de CORS no se
 * registran: son del navegador y no dicen nada.
 *
 * `LOG_DE_PEDIDOS=no` la apaga; lo usan los tests, que si no llenan la salida.
 * Se lee en cada pedido para que un test pueda prenderla.
 */
@Injectable()
export class PedidoMiddleware implements NestMiddleware {
  use(peticion: Peticion, respuesta: Respuesta, seguir: () => void): void {
    const contexto: ContextoDelPedido = { request_id: randomUUID(), campos: {} };
    const inicio = performance.now();
    respuesta.setHeader(CABECERA_REQUEST_ID, contexto.request_id);

    respuesta.on('finish', () => {
      if (peticion.method === 'OPTIONS' || process.env['LOG_DE_PEDIDOS'] === 'no') return;
      console.log(
        JSON.stringify({
          nivel: respuesta.statusCode >= 500 ? 'error' : 'info',
          request_id: contexto.request_id,
          metodo: peticion.method,
          ruta: peticion.originalUrl.split('?')[0],
          estado: respuesta.statusCode,
          ms: Math.round(performance.now() - inicio),
          ...contexto.campos,
        }),
      );
    });

    conContexto(contexto, seguir);
  }
}
