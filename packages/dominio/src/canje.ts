import { type Caja, revisarCaja } from './caja';
import { type Rechazo, rechazo } from './errores';
import {
  estaCompleta,
  estaVencida,
  ordenadosPorFecha,
  progresoDe,
  vencimientoDesde,
} from './tarjeta';
import type { Programa, TarjetaEnCurso } from './tipos';

export interface EntradaDeCanje extends Caja {
  ahora: Date;
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
    programa_id: string;
    negocio_id: string;
    local_alta_id: string;
    /** Nulo si nace vacia: una tarjeta sin sellos no vence (INV-12). */
    reloj_desde: Date | null;
    vence_el: Date | null;
  };
}

export type DecisionDeCanje = Rechazo | { tipo: 'canjear'; efecto: EfectoDeCanje };

/**
 * El canje: cierra la tarjeta, entrega el premio y abre la siguiente.
 *
 * Lo confirma siempre el negocio, nunca el cliente desde su telefono, asi que
 * pasa por la misma caja que el sellado.
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
  const problemaDeCaja = revisarCaja(entrada);
  if (problemaDeCaja !== null) return rechazo(problemaDeCaja);

  if (entrada.enCurso === null) return rechazo('TARJETA_INCOMPLETA');
  const { tarjeta, programa, sellos } = entrada.enCurso;

  if (tarjeta.estado !== 'activa') return rechazo('TARJETA_INCOMPLETA');
  if (estaVencida(tarjeta, entrada.ahora)) return rechazo('TARJETA_VENCIDA');

  const progreso = progresoDe(sellos);
  if (!estaCompleta(progreso, programa)) return rechazo('TARJETA_INCOMPLETA');

  // Donde se acumulo es donde se abrio la tarjeta.
  if (
    !entrada.negocio.canje_cualquier_local &&
    tarjeta.local_alta_id !== entrada.local.id
  ) {
    return rechazo('CANJE_EN_OTRO_LOCAL');
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
        turno_id: entrada.turno.id,
        premio_texto: programa.premio,
      },
      sellos_consumidos: consumidos.map((sello) => sello.id),
      sobrantes: sobrantes.map((sello) => sello.id),
      tarjetaNueva: {
        programa_id: entrada.programaVigente.id,
        negocio_id: entrada.negocio.id,
        local_alta_id: entrada.local.id,
        reloj_desde: arrastra ? entrada.ahora : null,
        vence_el: arrastra
          ? vencimientoDesde(entrada.ahora, entrada.programaVigente.vigencia_meses)
          : null,
      },
    },
  };
}
