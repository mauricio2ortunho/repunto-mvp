import { type Caja, revisarCaja } from './caja';
import { type CodigoDeError, type Rechazo, rechazo } from './errores';
import { type EntradaDeTarjeta, planDeSellado } from './sellado';
import { elegirTarjeta, estaCompleta, faltanPara, progresoDe } from './tarjeta';
import type {
  Cliente,
  Condicion,
  Programa,
  RegistroPendiente,
  Sello,
  TarjetaEnCurso,
} from './tipos';

/**
 * El alta del cliente en el mostrador (especificacion, seccion 3).
 *
 * El cliente escaneo el QR del local y dejo su telefono y su nombre; el cajero
 * lo tiene enfrente y confirma. Esa confirmacion presencial reemplaza al
 * codigo de verificacion y ahorra el costo del mensaje.
 *
 * Por eso el alta NO pide el codigo rotativo: el cliente todavia no tiene
 * cuenta, y si ya la tenia, el que autentica es el cajero mirandolo.
 *
 * Dos botones, y los dos pasan por aca: "confirmar y sellar", cuando la compra
 * califica, y "solo confirmar", para quien se registra sin comprar. Lo decide
 * el cajero, no el sistema.
 */
export interface EntradaDeAlta extends Caja {
  ahora: Date;
  /** Nulo si no existe, si es de otro local o si ya vencio. */
  registro: RegistroPendiente | null;
  /** El cajero eligio "confirmar y sellar". */
  sellar: boolean;
  /**
   * El cliente que ya tenia ese telefono, o null si es alguien nuevo. Lo
   * resuelve `apps/api` buscando por el telefono del registro: el que ya
   * existe no se registra de nuevo, abre una tarjeta mas (seccion 3).
   *
   * Solo el id y el nombre: el alta no mira el codigo ni la semilla, asi que
   * no hay por que descifrar el secreto de nadie para confirmarlo.
   */
  clienteExistente: Pick<Cliente, 'id' | 'nombre'> | null;
  programaVigente: Programa | null;
  condicionVigente: Condicion | null;
  /** La tarjeta activa del cliente existente en este negocio, si tiene. */
  enCurso: TarjetaEnCurso | null;
  ultimoSelloDelCliente: Sello | null;
}

export interface EfectoDeAlta {
  registro_id: string;
  /** El turno que confirma. Queda en el registro: quien y desde que tablet. */
  resuelto_turno_id: string;
  /**
   * La cuenta que hay que crear, o null si el telefono ya era de alguien. El
   * codigo publico y la semilla no salen de aca: son secretos que genera quien
   * ejecuta, con reintento ante colision.
   */
  crearCliente: { telefono: string; nombre: string } | null;
  /** El cliente que ya existia. Null cuando hay que crearlo. */
  cliente_id: string | null;
  vencerTarjeta: string | null;
  /**
   * Sin `cliente_id` a proposito: si la cuenta es nueva, recien existe cuando
   * se la inserta. Lo completa quien ejecuta.
   */
  abrirTarjeta: { programa_id: string; negocio_id: string; local_alta_id: string } | null;
  /** Solo si el cajero eligio "confirmar y sellar". */
  sello: {
    negocio_id: string;
    local_id: string;
    turno_id: string;
    condicion_id: string;
  } | null;
  arrancarReloj: { reloj_desde: Date; vence_el: Date | null } | null;
  aviso: {
    nombre: string;
    progreso: number;
    faltan: number;
    completa: boolean;
    premio: string;
    /** Si se otorgo un sello en el mismo acto. */
    sello: boolean;
  };
}

export type DecisionDeAlta = Rechazo | { tipo: 'alta'; efecto: EfectoDeAlta };

export function decidirAlta(entrada: EntradaDeAlta): DecisionDeAlta {
  const caja = revisarCaja(entrada);
  if (!caja.valido) return rechazo(caja.codigo);

  const problema = revisarRegistro(entrada);
  if (problema !== null) return rechazo(problema);
  const registro = entrada.registro;
  if (registro === null) return rechazo('REGISTRO_NO_ENCONTRADO');

  const existente = entrada.clienteExistente;
  const comun = {
    registro_id: registro.id,
    resuelto_turno_id: caja.turno.id,
    crearCliente:
      existente === null
        ? { telefono: registro.telefono, nombre: registro.nombre }
        : null,
    cliente_id: existente?.id ?? null,
    // El nombre del que ya tiene cuenta es el suyo, no el que acaba de tipear:
    // el cajero lo va a saludar como se llama en la app.
    nombre: existente?.nombre ?? registro.nombre,
  };

  if (entrada.sellar) {
    const entradaDeTarjeta: EntradaDeTarjeta = {
      ahora: entrada.ahora,
      negocio: entrada.negocio,
      local: entrada.local,
      turno: caja.turno,
      programaVigente: entrada.programaVigente,
      condicionVigente: entrada.condicionVigente,
      enCurso: entrada.enCurso,
      ultimoSelloDelCliente: entrada.ultimoSelloDelCliente,
    };
    const resultado = planDeSellado(entradaDeTarjeta);
    if (!resultado.valido) return rechazo(resultado.codigo, resultado.detalle);
    const plan = resultado.plan;

    return {
      tipo: 'alta',
      efecto: {
        registro_id: comun.registro_id,
        resuelto_turno_id: comun.resuelto_turno_id,
        crearCliente: comun.crearCliente,
        cliente_id: comun.cliente_id,
        vencerTarjeta: plan.vencerTarjeta,
        abrirTarjeta: plan.abrirTarjeta,
        sello: plan.sello,
        arrancarReloj: plan.arrancarReloj,
        aviso: {
          nombre: comun.nombre,
          progreso: plan.progreso,
          faltan: plan.faltan,
          completa: plan.completa,
          premio: plan.premio,
          sello: true,
        },
      },
    };
  }

  // "Solo confirmar": no hay sello, pero si tarjeta. Un cliente confirmado sin
  // tarjeta en el negocio no tendria nada que mirar en la app.
  const elegida = elegirTarjeta(entrada.enCurso, entrada.programaVigente, entrada.ahora);
  const programa = elegida.programa;
  if (programa === null) return rechazo('PROMO_NO_CONFIGURADA');

  const progreso = elegida.enCurso === null ? 0 : progresoDe(elegida.enCurso.sellos);

  return {
    tipo: 'alta',
    efecto: {
      registro_id: comun.registro_id,
      resuelto_turno_id: comun.resuelto_turno_id,
      crearCliente: comun.crearCliente,
      cliente_id: comun.cliente_id,
      vencerTarjeta: elegida.vencerTarjeta,
      abrirTarjeta:
        elegida.enCurso === null
          ? {
              programa_id: programa.id,
              negocio_id: entrada.negocio.id,
              local_alta_id: entrada.local.id,
            }
          : null,
      sello: null,
      arrancarReloj: null,
      aviso: {
        nombre: comun.nombre,
        progreso,
        faltan: faltanPara(progreso, programa),
        completa: estaCompleta(progreso, programa),
        premio: programa.premio,
        sello: false,
      },
    },
  };
}

/**
 * Si ese registro se puede tocar desde esta caja.
 *
 * Un registro de otra sucursal, uno que no existe y uno que ya vencio dan el
 * mismo codigo a proposito: si se distinguieran, desde una tablet se podria
 * averiguar quien se esta registrando en otro local.
 */
function revisarRegistro(entrada: {
  ahora: Date;
  local: { id: string };
  registro: RegistroPendiente | null;
}): CodigoDeError | null {
  const registro = entrada.registro;
  if (registro === null) return 'REGISTRO_NO_ENCONTRADO';
  if (registro.local_id !== entrada.local.id) return 'REGISTRO_NO_ENCONTRADO';
  if (entrada.ahora.getTime() > registro.expira_el.getTime()) {
    return 'REGISTRO_NO_ENCONTRADO';
  }
  if (registro.estado !== 'pendiente') return 'REGISTRO_YA_RESUELTO';
  return null;
}

/** "El cliente se fue" o "no era para este local": el cajero lo saca de la lista. */
export interface EntradaDeDescarte extends Caja {
  ahora: Date;
  registro: RegistroPendiente | null;
}

export type DecisionDeDescarte =
  | Rechazo
  | { tipo: 'descartar'; efecto: { registro_id: string; resuelto_turno_id: string } };

export function decidirDescarte(entrada: EntradaDeDescarte): DecisionDeDescarte {
  const caja = revisarCaja(entrada);
  if (!caja.valido) return rechazo(caja.codigo);

  const problema = revisarRegistro(entrada);
  if (problema !== null) return rechazo(problema);
  const registro = entrada.registro;
  if (registro === null) return rechazo('REGISTRO_NO_ENCONTRADO');

  // Se marca, no se borra: un registro que nadie confirmo es la señal de que
  // en ese local no estan ofreciendo la tarjeta (especificacion, seccion 11).
  return {
    tipo: 'descartar',
    efecto: { registro_id: registro.id, resuelto_turno_id: caja.turno.id },
  };
}
