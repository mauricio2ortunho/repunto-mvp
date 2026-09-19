import { type Caja, revisarCaja } from './caja';
import { revisarCodigo } from './codigo';
import { type Rechazo, rechazo } from './errores';
import {
  estaCompleta,
  estaVencida,
  ordenadosPorFecha,
  progresoDe,
  vencimientoDesde,
} from './tarjeta';
import type { Cliente, Programa, TarjetaEnCurso } from './tipos';

export interface EntradaDeCanje extends Caja {
  ahora: Date;
  /** Nulo si el prefijo del codigo no resuelve a nadie. */
  cliente: Cliente | null;
  /**
   * El codigo que el cliente muestra, igual que al sellar. El canje lo
   * confirma el negocio, pero con el cliente presente: sin su codigo, un
   * cajero podria entregarse a si mismo el premio de alguien ausente. Consume
   * su ventana, como cualquier uso del codigo (INV-9).
   */
  codigo: string;
  /** Lo responde la base: el insert en codigo_usado choco con el unico (INV-9). */
  codigoYaUsado: boolean;
  /** La tarjeta activa del cliente en este negocio, o null si no tiene. */
  enCurso: TarjetaEnCurso | null;
  /** Version vigente: con ella nace la tarjeta nueva, no con la que se cierra. */
  programaVigente: Programa | null;
}

export interface EfectoDeCanje {
  /** La tarjeta que se cierra. Pasa a 'canjeada'. */
  tarjeta_id: string;
  canje: { negocio_id: string; local_id: string; turno_id: string; premio_texto: string };
  /** Los sellos mas viejos, tantos como pedia el programa de esa tarjeta. */
  sellos_consumidos: string[];
  /** Los que sobran: se reasignan a la nueva con su fecha y local (INV-15). */
  sobrantes: string[];
  tarjetaNueva: {
    cliente_id: string;
    programa_id: string;
    negocio_id: string;
    local_alta_id: string;
    /** Nulo si nace vacia: una tarjeta sin sellos no vence (INV-12). */
    reloj_desde: Date | null;
    vence_el: Date | null;
  };
  /** Lo que el cajero le dice al cliente mientras le entrega el premio. */
  aviso: { nombre: string; premio: string; sobrantes: number };
}

export type DecisionDeCanje = Rechazo | { tipo: 'canjear'; efecto: EfectoDeCanje };

/**
 * El canje: cierra la tarjeta, entrega el premio y abre la siguiente.
 *
 * Lo confirma siempre el negocio, nunca el cliente desde su telefono, asi que
 * pasa por la misma caja que el sellado y pide el mismo codigo: el cliente
 * tiene que estar ahi para recibir su premio.
 *
 * Reglas que resuelve, en el orden en que se leen:
 *  - Se consumen los sellos mas viejos; los mas nuevos sobran y se reasignan.
 *  - La tarjeta nueva nace con el programa vigente al momento del canje.
 *  - El reloj arranca en el canje, no en el sello sobrante mas viejo (INV-14),
 *    pero solo si arrastra sobrantes: sin sellos no vence (INV-12 manda).
 *  - `premio_texto` es el premio de la tarjeta que se cierra, que es la regla
 *    con la que el cliente junto.
 */
export function decidirCanje(entrada: EntradaDeCanje): DecisionDeCanje {
  const caja = revisarCaja(entrada);
  if (!caja.valido) return rechazo(caja.codigo);

  const revision = revisarCodigo(entrada);
  if (!revision.valido) return rechazo(revision.codigo);
  const cliente = revision.cliente;

  if (entrada.enCurso === null) return rechazo('TARJETA_INCOMPLETA');
  const { tarjeta, programa, sellos } = entrada.enCurso;

  if (tarjeta.estado !== 'activa') return rechazo('TARJETA_INCOMPLETA');
  if (estaVencida(tarjeta, entrada.ahora)) return rechazo('TARJETA_VENCIDA');

  const progreso = progresoDe(sellos);
  if (!estaCompleta(progreso, programa)) return rechazo('TARJETA_INCOMPLETA');

  // Donde se acumulo es donde se abrio la tarjeta. El rechazo dice cual es:
  // "se entrega en Equipetrol" le sirve al cajero, "donde abrio la tarjeta" lo
  // obliga a averiguarlo.
  if (
    !entrada.negocio.canje_cualquier_local &&
    tarjeta.local_alta_id !== entrada.local.id
  ) {
    return rechazo('CANJE_EN_OTRO_LOCAL', { local_alta_id: tarjeta.local_alta_id });
  }

  // La tarjeta nueva necesita una version vigente con la cual nacer.
  if (entrada.programaVigente === null) return rechazo('PROMO_NO_CONFIGURADA');

  const noAnulados = ordenadosPorFecha(sellos.filter((sello) => !sello.anulado));
  const consumidos = noAnulados.slice(0, programa.sellos_requeridos);
  const sobrantes = noAnulados.slice(programa.sellos_requeridos);
  const arrastra = sobrantes.length > 0;

  return {
    tipo: 'canjear',
    efecto: {
      tarjeta_id: tarjeta.id,
      canje: {
        negocio_id: entrada.negocio.id,
        local_id: entrada.local.id,
        turno_id: caja.turno.id,
        premio_texto: programa.premio,
      },
      sellos_consumidos: consumidos.map((sello) => sello.id),
      sobrantes: sobrantes.map((sello) => sello.id),
      tarjetaNueva: {
        cliente_id: cliente.id,
        programa_id: entrada.programaVigente.id,
        negocio_id: entrada.negocio.id,
        local_alta_id: entrada.local.id,
        reloj_desde: arrastra ? entrada.ahora : null,
        vence_el: arrastra
          ? vencimientoDesde(entrada.ahora, entrada.programaVigente.vigencia_meses)
          : null,
      },
      aviso: {
        nombre: cliente.nombre,
        premio: programa.premio,
        sobrantes: sobrantes.length,
      },
    },
  };
}
