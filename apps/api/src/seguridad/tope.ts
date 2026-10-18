import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { errorDeApi } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { claveDerivada } from './cifrado';

/**
 * Topes de peticiones por hora, contados en la base (`tope_peticion`).
 *
 * Los usan el endpoint del codigo del cliente y el registro publico, que es el
 * unico de la caja sin credencial: el QR del mostrador se puede fotografiar.
 *
 * En la base y no en memoria porque la api corre serverless: cada invocacion
 * puede ser otro proceso, y un contador en una variable no cuenta lo que
 * parece contar (CLAUDE.md, seccion 2). La ventana es la hora fija del reloj
 * de la base; ver el modelo en schema.prisma.
 */

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

/**
 * Codigos equivocados por tablet. Un cajero que se equivoca tipeando no llega
 * a veinte en una hora; quien prueba codigos al azar para adivinar el TOTP de
 * alguien, si. Es por tablet y no por cliente a proposito: por cliente,
 * cualquiera podria bloquearle el codigo a otro equivocandose con su prefijo.
 */
export const TOPE_DE_CODIGOS_EQUIVOCADOS = 20;

@Injectable()
export class TopeDePeticiones {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Registra una peticion de esa clave y falla si paso el tope.
   *
   * Va fuera de cualquier transaccion a proposito: si la peticion despues se
   * rechaza y su transaccion se deshace, el intento igual cuenta.
   */
  async exigir(clave: string, tope: number): Promise<void> {
    if ((await this.sumar(clave)) > tope) throw errorDeApi('TOPE_SUPERADO');
  }

  /**
   * Falla si esa clave ya llego al tope en esta hora, sin contar nada. Para
   * los topes que cuentan solo los fracasos: se mira antes de intentar y se
   * suma despues, si salio mal.
   */
  async verificar(clave: string, tope: number): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ cuenta: number }[]>`
      SELECT cuenta FROM tope_peticion
      WHERE clave = ${huella(clave)} AND ventana = date_trunc('hour', now())`;
    if ((filas[0]?.cuenta ?? 0) >= tope) throw errorDeApi('TOPE_SUPERADO');
  }

  /** Suma uno a la cuenta de esta hora y la devuelve. */
  async sumar(clave: string): Promise<number> {
    const filas = await this.prisma.$queryRaw<{ cuenta: number }[]>`
      INSERT INTO tope_peticion (clave, ventana, cuenta)
      VALUES (${huella(clave)}, date_trunc('hour', now()), 1)
      ON CONFLICT (clave, ventana)
        DO UPDATE SET cuenta = tope_peticion.cuenta + 1
      RETURNING cuenta`;
    return filas[0]?.cuenta ?? 0;
  }
}

/**
 * HMAC y no SHA-256 a secas: un telefono boliviano son ocho digitos, y su
 * hash se revierte probandolos todos en una tarde. Con la clave derivada,
 * quien lea la tabla no puede.
 */
function huella(clave: string): string {
  return createHmac('sha256', claveDerivada('tope-de-peticiones'))
    .update(clave, 'utf8')
    .digest('hex');
}
