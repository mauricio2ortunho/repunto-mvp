import { Injectable } from '@nestjs/common';

import { errorDeApi } from '../caja/errores-http';

/**
 * Topes de peticiones por hora, contados en memoria.
 *
 * Los usan el endpoint del codigo del cliente y el registro publico, que es el
 * unico de la caja sin credencial: el QR del mostrador se puede fotografiar.
 *
 * LIMITACION: vive en memoria del proceso. Con una sola instancia de la api
 * —que es el MVP— alcanza; con dos, cada una cuenta la suya y el tope real se
 * duplica. Cuando haya mas de una instancia, esto se muda a la base o a Redis.
 */

const VENTANA_MS = 3_600_000;

/** El codigo que muestra el cliente: dos ventanas por pedido. */
export const TOPE_DEL_CODIGO = 120;

/** La PWA pregunta cada pocos segundos si el cajero ya la confirmo. */
export const TOPE_DEL_TICKET = 600;

/** Registros por telefono. Quien pasa de esto no se esta registrando. */
export const TOPE_POR_TELEFONO = 5;

/**
 * Registros por IP. Holgado a proposito: en un cafe todos los telefonos salen
 * por la misma IP, y un local lleno puede registrar treinta personas en una
 * hora. El freno fino es el tope de pendientes por local; este es la red para
 * el que automatiza desde su casa.
 */
export const TOPE_POR_IP = 60;

@Injectable()
export class TopeDePeticiones {
  private readonly pedidos = new Map<string, number[]>();

  /** Registra una peticion de esa clave y falla si paso el tope. */
  exigir(clave: string, tope: number, ahora: number = Date.now()): void {
    const desde = ahora - VENTANA_MS;
    const recientes = (this.pedidos.get(clave) ?? []).filter(
      (instante) => instante > desde,
    );

    if (recientes.length >= tope) {
      this.pedidos.set(clave, recientes);
      throw errorDeApi('TOPE_SUPERADO');
    }

    recientes.push(ahora);
    this.pedidos.set(clave, recientes);
    this.olvidarViejos(desde);
  }

  /** Solo para los tests: deja las cuentas en cero entre caso y caso. */
  reiniciar(): void {
    this.pedidos.clear();
  }

  /** Sin esto, quien pidio una vez se queda en memoria para siempre. */
  private olvidarViejos(desde: number): void {
    for (const [clave, instantes] of this.pedidos) {
      const ultimo = instantes[instantes.length - 1];
      if (ultimo === undefined || ultimo <= desde) this.pedidos.delete(clave);
    }
  }
}
