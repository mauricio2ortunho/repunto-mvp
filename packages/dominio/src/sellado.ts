import { type Caja, revisarCaja } from './caja';
import { revisarCodigo } from './codigo';
import { type Rechazo, rechazo } from './errores';
import {
  estaCompleta,
  estaVencida,
  faltanPara,
  progresoDe,
  vencimientoDesde,
} from './tarjeta';
import type { Cliente, Condicion, Programa, Sello, TarjetaEnCurso } from './tipos';

const MS_POR_HORA = 3_600_000;

export interface EntradaDeSellado extends Caja {
  ahora: Date;
  /** Nulo si el prefijo del codigo no resuelve a nadie. */
  cliente: Cliente | null;
  /** Lo que el cajero tipeo, tal cual: `K7Q4M-418329`, `k7q4m 418329`, etc. */
  codigo: string;
  /** Lo responde la base: el insert en codigo_usado choco con el unico (INV-9). */
  codigoYaUsado: boolean;
  /** Version vigente del programa. Nula si el negocio no tiene ninguna. */
  programaVigente: Programa | null;
  /** Condicion vigente, la que se adjunta al sello. Nula si no hay ninguna. */
  condicionVigente: Condicion | null;
  /** La tarjeta activa del cliente en este negocio, o null si no tiene. */
  enCurso: TarjetaEnCurso | null;
  /**
   * Ultimo sello no anulado del cliente en ESTE negocio, sin importar de que
   * tarjeta sea. El intervalo minimo se mide contra el: si se midiera por
   * tarjeta, alguien canjearia y sellaria de nuevo al instante.
   */
  ultimoSelloDelCliente: Sello | null;
}

export interface EfectoDeSellado {
  /** La tarjeta sobre la que se sella, o null si hay que abrir una. */
  tarjeta_id: string | null;
  /** La tarjeta vencida que hay que cerrar antes de abrir la nueva, o null. */
  vencerTarjeta: string | null;
  /** Que tarjeta abrir antes de sellar, o null si ya habia una en curso. */
  abrirTarjeta: {
    cliente_id: string;
    programa_id: string;
    negocio_id: string;
    local_alta_id: string;
  } | null;
  sello: { negocio_id: string; local_id: string; turno_id: string; condicion_id: string };
  /** Solo con el primer sello de la tarjeta (INV-12, INV-13). */
  arrancarReloj: { reloj_desde: Date; vence_el: Date | null } | null;
  /** Lo que el cajero le dice al cliente en voz alta. */
  aviso: {
    nombre: string;
    progreso: number;
    faltan: number;
    completa: boolean;
    /** El premio de la regla que rige ESTA tarjeta, que puede no ser la vigente. */
    premio: string;
  };
}

export type DecisionDeSellado = Rechazo | { tipo: 'sellar'; efecto: EfectoDeSellado };

/**
 * Las ocho validaciones de la seccion 5 de la especificacion, en su orden.
 *
 * La cuarta —registrar el consumo del codigo— escribe, asi que no vive aca:
 * `apps/api` inserta en codigo_usado antes de llamar y pasa el resultado en
 * `codigoYaUsado`. El orden de los efectos se mantiene: el consumo se registra
 * antes de crear el sello, en la misma transaccion (INV-9, INV-19).
 *
 * Una tarjeta vencida no rechaza el sello: se cierra y se abre una nueva. El
 * cron que vence tarjetas corre una vez por dia, y trabar al cajero con el
 * cliente enfrente y la compra hecha, hasta las 00:15 del dia siguiente, es el
 * peor momento posible para hacerlo esperar.
 *
 * No lee ni escribe nada. Devuelve que hacer.
 */
export function decidirSello(entrada: EntradaDeSellado): DecisionDeSellado {
  // 1 y 2. Equipo, local, turno, persona y negocio.
  const caja = revisarCaja(entrada);
  if (!caja.valido) return rechazo(caja.codigo);

  // 3 y 4. El codigo resuelve al cliente, con la ventana actual o la anterior,
  // y esa ventana no se habia consumido.
  const revision = revisarCodigo(entrada);
  if (!revision.valido) return rechazo(revision.codigo);
  const cliente = revision.cliente;

  // 5. La tarjeta activa, o la que habria que abrir. La promo tiene que estar
  // configurada: sin condicion no hay sello que insertar.
  if (entrada.condicionVigente === null) return rechazo('PROMO_NO_CONFIGURADA');

  // Una tarjeta vencida deja de estar en curso: se cierra y el sello abre la
  // siguiente, con la regla vigente de hoy.
  const vencida =
    entrada.enCurso !== null && estaVencida(entrada.enCurso.tarjeta, entrada.ahora)
      ? entrada.enCurso
      : null;
  const enCurso = vencida === null ? entrada.enCurso : null;
  const vencerTarjeta = vencida === null ? null : vencida.tarjeta.id;

  // La tarjeta en curso termina con la regla con la que empezo (INV-6); una
  // nueva nace con la vigente. Sin programa vigente no hay tarjeta que abrir.
  const programa = enCurso?.programa ?? entrada.programaVigente;
  if (programa === null) return rechazo('PROMO_NO_CONFIGURADA');

  // 6. Intervalo minimo entre sellos. El rechazo dice desde cuando puede
  // volver: el cajero necesita decirle la hora, no "todavia no".
  if (entrada.ultimoSelloDelCliente !== null) {
    const espera = programa.horas_entre_sellos * MS_POR_HORA;
    const desde = new Date(entrada.ultimoSelloDelCliente.creado_el.getTime() + espera);
    if (entrada.ahora.getTime() < desde.getTime()) {
      return rechazo('DEMASIADO_PRONTO', { puede_sellar_desde: desde });
    }
  }

  // 7. Completa. (Vencida ya se resolvio arriba: abre tarjeta nueva.)
  const progresoActual = enCurso === null ? 0 : progresoDe(enCurso.sellos);
  if (enCurso !== null && estaCompleta(progresoActual, programa)) {
    return rechazo('TARJETA_COMPLETA');
  }

  // 8. El sello, con la condicion vigente adjunta. Si es el primero de la
  // tarjeta, arranca el reloj.
  const esPrimerSello = enCurso === null || enCurso.tarjeta.reloj_desde === null;
  const progreso = progresoActual + 1;

  return {
    tipo: 'sellar',
    efecto: {
      tarjeta_id: enCurso?.tarjeta.id ?? null,
      vencerTarjeta,
      abrirTarjeta:
        enCurso === null
          ? {
              cliente_id: cliente.id,
              programa_id: programa.id,
              negocio_id: entrada.negocio.id,
              local_alta_id: entrada.local.id,
            }
          : null,
      sello: {
        negocio_id: entrada.negocio.id,
        local_id: entrada.local.id,
        turno_id: caja.turno.id,
        condicion_id: entrada.condicionVigente.id,
      },
      arrancarReloj: esPrimerSello
        ? {
            reloj_desde: entrada.ahora,
            vence_el: vencimientoDesde(entrada.ahora, programa.vigencia_meses),
          }
        : null,
      aviso: {
        nombre: cliente.nombre,
        progreso,
        faltan: faltanPara(progreso, programa),
        completa: estaCompleta(progreso, programa),
        premio: programa.premio,
      },
    },
  };
}
