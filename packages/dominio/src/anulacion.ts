import { type Caja, revisarCaja } from './caja';
import { type Rechazo, rechazo } from './errores';
import { estaCompleta, faltanPara, progresoDe } from './tarjeta';
import type { Programa, Sello, TarjetaEnCurso, Turno } from './tipos';

/**
 * Deshacer un sello (especificacion, seccion 5).
 *
 * Marca, nunca borra (INV-17): queda `anulado`, `anulado_el` y el turno desde
 * el que se anulo, que es lo que despues permite ver que local anula de mas.
 *
 * Quien puede que sale del ROL DEL TURNO, no del request: el turno apunta al
 * usuario y el usuario tiene su rol. Un cajero no puede pedir anular "como
 * supervisor" porque no hay donde decirlo, igual que el local sale del
 * dispositivo (INV-2).
 */

/** Cinco minutos para deshacer el propio ultimo sello (CLAUDE.md, seccion 6). */
export const MINUTOS_PARA_DESHACER = 5;

const MS_POR_MINUTO = 60_000;

/** El sello que se quiere anular, ya leido. */
export interface SelloParaAnular {
  id: string;
  tarjeta_id: string;
  /** El local donde se otorgo. Tiene que ser el de esta caja. */
  local_id: string;
  /** El usuario del turno en el que se otorgo. */
  usuario_id: string;
  creado_el: Date;
  anulado: boolean;
  /** Estado de la tarjeta a la que pertenece hoy. */
  tarjeta_estado: 'activa' | 'canjeada' | 'vencida';
}

export interface EntradaDeAnulacion extends Caja {
  ahora: Date;
  /** Nulo si no existe. */
  sello: SelloParaAnular | null;
  /**
   * Ultimo sello no anulado otorgado por el usuario de ESTE turno en ESTE
   * local. El cajero solo deshace el suyo y solo si es el ultimo; que lo sea
   * se decide aca y no en la api, que si no se llevaria la regla.
   */
  ultimoSelloDelUsuario: Sello | null;
  /** La tarjeta del sello con todos sus sellos, para decir como queda. */
  tarjeta: TarjetaEnCurso | null;
  /** El nombre del cliente de esa tarjeta. */
  nombreDelCliente: string | null;
  /** El programa de esa tarjeta, para el progreso del aviso. */
  programaDeLaTarjeta: Programa | null;
}

export interface EfectoDeAnulacion {
  sello_id: string;
  /** El turno desde el que se anula. De ahi salen el usuario y el equipo. */
  anulado_turno_id: string;
  /** Como queda la tarjeta despues de anular. */
  aviso: { nombre: string; progreso: number; faltan: number; completa: boolean };
}

export type DecisionDeAnulacion = Rechazo | { tipo: 'anular'; efecto: EfectoDeAnulacion };

export function decidirAnulacion(entrada: EntradaDeAnulacion): DecisionDeAnulacion {
  const caja = revisarCaja(entrada);
  if (!caja.valido) return rechazo(caja.codigo);

  const sello = entrada.sello;
  if (sello === null) return rechazo('SELLO_NO_ENCONTRADO');
  // De otra sucursal es igual que inexistente: nadie averigua desde su tablet
  // que sellos hay en otro local.
  if (sello.local_id !== entrada.local.id) return rechazo('SELLO_NO_ENCONTRADO');
  if (sello.anulado) return rechazo('SELLO_YA_ANULADO');

  // El premio ya se entrego con ese sello adentro. Anularlo dejaria un canje
  // con menos sellos de los que pedia el programa.
  if (sello.tarjeta_estado === 'canjeada') return rechazo('SELLO_YA_CANJEADO');

  if (!puedeAnular(entrada, sello, caja.turno)) {
    return rechazo('ANULACION_NO_PERMITIDA');
  }

  const tarjeta = entrada.tarjeta;
  const programa = entrada.programaDeLaTarjeta;
  if (tarjeta === null || programa === null || entrada.nombreDelCliente === null) {
    // No puede pasar: si hay sello, hay tarjeta, programa y cliente.
    return rechazo('SELLO_NO_ENCONTRADO');
  }

  const progreso = progresoDe(tarjeta.sellos.filter((otro) => otro.id !== sello.id));

  return {
    tipo: 'anular',
    efecto: {
      sello_id: sello.id,
      anulado_turno_id: caja.turno.id,
      aviso: {
        nombre: entrada.nombreDelCliente,
        progreso,
        faltan: faltanPara(progreso, programa),
        completa: estaCompleta(progreso, programa),
      },
    },
  };
}

/**
 * El supervisor anula cualquier sello de su local, sin limite de tiempo, que
 * es para lo que esta. El dueño, lo mismo: es su negocio.
 *
 * El cajero solo deshace lo que acaba de hacer: su propio ultimo sello, dentro
 * de los cinco minutos. Las tres condiciones juntas, y las tres devuelven el
 * mismo codigo: al cajero le sirve la misma frase, y separarlas le diria de
 * quien es cada sello del local.
 */
function puedeAnular(
  entrada: EntradaDeAnulacion,
  sello: SelloParaAnular,
  turno: Turno,
): boolean {
  if (turno.rol === 'supervisor' || turno.rol === 'dueno') return true;

  if (sello.usuario_id !== turno.usuario_id) return false;
  if (entrada.ultimoSelloDelUsuario?.id !== sello.id) return false;

  const transcurrido = entrada.ahora.getTime() - sello.creado_el.getTime();
  return transcurrido <= MINUTOS_PARA_DESHACER * MS_POR_MINUTO;
}
