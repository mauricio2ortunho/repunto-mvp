import { Injectable } from '@nestjs/common';

import { errorDeApi } from '../caja/errores-http';

/**
 * Tope de peticiones por cliente del endpoint del codigo.
 *
 * 120 por hora: la app pide dos ventanas por vez, asi que con una peticion por
 * minuto le alcanza para tener el codigo en pantalla toda una fila, y sobra
 * margen para reintentos. Quien pida mucho mas esta raspando codigos.
 *
 * LIMITACION: vive en memoria del proceso. Con una sola instancia de la api
 * —que es el MVP— alcanza; con dos, cada una cuenta la suya y el tope real se
 * duplica. Cuando haya mas de una instancia, esto se muda a la base o a Redis.
 */

const TOPE_POR_HORA = 120;
const VENTANA_MS = 3_600_000;

@Injectable()
export class TopeDePeticiones {
  private readonly pedidos = new Map<string, number[]>();

  /** Registra una peticion del cliente y falla si paso el tope. */
  exigir(cliente_id: string, ahora: number = Date.now()): void {
    const desde = ahora - VENTANA_MS;
    const recientes = (this.pedidos.get(cliente_id) ?? []).filter(
      (instante) => instante > desde,
    );

    if (recientes.length >= TOPE_POR_HORA) {
      this.pedidos.set(cliente_id, recientes);
      throw errorDeApi('TOPE_SUPERADO');
    }

    recientes.push(ahora);
    this.pedidos.set(cliente_id, recientes);
    this.olvidarViejos(desde);
  }

  /** Sin esto, un cliente que pidio una vez se queda en memoria para siempre. */
  private olvidarViejos(desde: number): void {
    for (const [cliente_id, instantes] of this.pedidos) {
      const ultimo = instantes[instantes.length - 1];
      if (ultimo === undefined || ultimo <= desde) this.pedidos.delete(cliente_id);
    }
  }
}
