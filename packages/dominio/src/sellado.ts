import { type Caja, revisarCaja } from './caja';
import { revisarCodigo } from './codigo';
import {
  type CodigoDeError,
  type DetalleDeRechazo,
  type Rechazo,
  rechazo,
} from './errores';
import {
  elegirTarjeta,
  estaCompleta,
  faltanPara,
  progresoDe,
  vencimientoDesde,
} from './tarjeta';
import type {
  Cliente,
  Condicion,
  Local,
  Negocio,
  Programa,
  Sello,
  TarjetaEnCurso,
  Turno,
} from './tipos';

const MS_POR_HORA = 3_600_000;

/**
 * El estado de la tarjeta del cliente en este negocio, sin nada sobre como se
 * lo identifico. Lo comparten el sellado —que identifica por codigo rotativo—
 * y el alta —que identifica por la confirmacion del cajero de cuerpo presente.
 */
export interface EntradaDeTarjeta {
  ahora: Date;
  negocio: Negocio;
  local: Local;
  turno: Turno;
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

/** Que escribir para que el sello exista, sin quien es el cliente. */
export interface PlanDeSellado {
  /** La tarjeta sobre la que se sella, o null si hay que abrir una. */
  tarjeta_id: string | null;
  /** La tarjeta vencida que hay que cerrar antes de abrir la nueva, o null. */
  vencerTarjeta: string | null;
  /** Sin `cliente_id`: quien llama lo sabe, y en el alta recien va a existir. */
  abrirTarjeta: { programa_id: string; negocio_id: string; local_alta_id: string } | null;
  sello: { negocio_id: string; local_id: string; turno_id: string; condicion_id: string };
  /** Solo con el primer sello de la tarjeta (INV-12, INV-13). */
  arrancarReloj: { reloj_desde: Date; vence_el: Date | null } | null;
  progreso: number;
  faltan: number;
  completa: boolean;
  premio: string;
}

export type ResultadoDelPlan =
  | { valido: true; plan: PlanDeSellado }
  | { valido: false; codigo: CodigoDeError; detalle?: DetalleDeRechazo };

/**
 * Las reglas del sello propiamente dicho: promo configurada, tarjeta que
 * aplica, intervalo minimo y tarjeta no completa. No sabe nada de codigos ni
 * de registros: recibe el estado y devuelve que escribir.
 */
export function planDeSellado(entrada: EntradaDeTarjeta): ResultadoDelPlan {
  // Sin condicion vigente no hay sello que insertar: es un error del dueño.
  if (entrada.condicionVigente === null) {
    return { valido: false, codigo: 'PROMO_NO_CONFIGURADA' };
  }

  const elegida = elegirTarjeta(entrada.enCurso, entrada.programaVigente, entrada.ahora);
  const programa = elegida.programa;
  if (programa === null) return { valido: false, codigo: 'PROMO_NO_CONFIGURADA' };

  // Intervalo minimo entre sellos. El rechazo dice desde cuando puede volver:
  // el cajero necesita decirle la hora, no "todavia no".
  if (entrada.ultimoSelloDelCliente !== null) {
    const espera = programa.horas_entre_sellos * MS_POR_HORA;
    const desde = new Date(entrada.ultimoSelloDelCliente.creado_el.getTime() + espera);
    if (entrada.ahora.getTime() < desde.getTime()) {
      return {
        valido: false,
        codigo: 'DEMASIADO_PRONTO',
        detalle: { puede_sellar_desde: desde },
      };
    }
  }

  const enCurso = elegida.enCurso;
  const progresoActual = enCurso === null ? 0 : progresoDe(enCurso.sellos);
  if (enCurso !== null && estaCompleta(progresoActual, programa)) {
    return { valido: false, codigo: 'TARJETA_COMPLETA' };
  }

  const esPrimerSello = enCurso === null || enCurso.tarjeta.reloj_desde === null;
  const progreso = progresoActual + 1;

  return {
    valido: true,
    plan: {
      tarjeta_id: enCurso?.tarjeta.id ?? null,
      vencerTarjeta: elegida.vencerTarjeta,
      abrirTarjeta:
        enCurso === null
          ? {
              programa_id: programa.id,
              negocio_id: entrada.negocio.id,
              local_alta_id: entrada.local.id,
            }
          : null,
      sello: {
        negocio_id: entrada.negocio.id,
        local_id: entrada.local.id,
        turno_id: entrada.turno.id,
        condicion_id: entrada.condicionVigente.id,
      },
      arrancarReloj: esPrimerSello
        ? {
            reloj_desde: entrada.ahora,
            vence_el: vencimientoDesde(entrada.ahora, programa.vigencia_meses),
          }
        : null,
      progreso,
      faltan: faltanPara(progreso, programa),
      completa: estaCompleta(progreso, programa),
      premio: programa.premio,
    },
  };
}

export interface EntradaDeSellado extends Caja {
  ahora: Date;
  /** Nulo si el prefijo del codigo no resuelve a nadie. */
  cliente: Cliente | null;
  /** Lo que el cajero tipeo, tal cual: `K7Q4M-418329`, `k7q4m 418329`, etc. */
  codigo: string;
  /** Lo responde la base: el insert en codigo_usado choco con el unico (INV-9). */
  codigoYaUsado: boolean;
  programaVigente: Programa | null;
  condicionVigente: Condicion | null;
  enCurso: TarjetaEnCurso | null;
  ultimoSelloDelCliente: Sello | null;
}

export interface EfectoDeSellado {
  tarjeta_id: string | null;
  vencerTarjeta: string | null;
  abrirTarjeta: {
    cliente_id: string;
    programa_id: string;
    negocio_id: string;
    local_alta_id: string;
  } | null;
  sello: { negocio_id: string; local_id: string; turno_id: string; condicion_id: string };
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

  // 5 a 8. La tarjeta, el intervalo y el sello.
  const resultado = planDeSellado({
    ahora: entrada.ahora,
    negocio: entrada.negocio,
    local: entrada.local,
    turno: caja.turno,
    programaVigente: entrada.programaVigente,
    condicionVigente: entrada.condicionVigente,
    enCurso: entrada.enCurso,
    ultimoSelloDelCliente: entrada.ultimoSelloDelCliente,
  });
  if (!resultado.valido) return rechazo(resultado.codigo, resultado.detalle);
  const plan = resultado.plan;

  return {
    tipo: 'sellar',
    efecto: {
      tarjeta_id: plan.tarjeta_id,
      vencerTarjeta: plan.vencerTarjeta,
      abrirTarjeta:
        plan.abrirTarjeta === null
          ? null
          : { cliente_id: cliente.id, ...plan.abrirTarjeta },
      sello: plan.sello,
      arrancarReloj: plan.arrancarReloj,
      aviso: {
        nombre: cliente.nombre,
        progreso: plan.progreso,
        faltan: plan.faltan,
        completa: plan.completa,
        premio: plan.premio,
      },
    },
  };
}
