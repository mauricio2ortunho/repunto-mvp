import { codigoDeVentana, ventanaDe } from '../codigo';
import type { EntradaDeAlta } from '../alta';
import type { EntradaDeAnulacion, SelloParaAnular } from '../anulacion';
import type { EntradaDeCanje } from '../canje';
import type { EntradaDeSellado } from '../sellado';
import type {
  Asignacion,
  Cliente,
  Condicion,
  Dispositivo,
  Local,
  Negocio,
  Programa,
  RegistroPendiente,
  Sello,
  Tarjeta,
  TarjetaEnCurso,
  Turno,
} from '../tipos';

/**
 * Escenario coherente para los tests del dominio: una caja que puede operar,
 * un cliente con su codigo y una promo configurada. Cada test rompe lo que
 * quiere probar y deja el resto en pie.
 *
 * No se compila al paquete publicado (ver tsconfig): es andamiaje de tests.
 */

/** Mediodia del 18 de septiembre de 2026 en La Paz. */
export const AHORA = new Date('2026-09-18T16:00:00.000Z');

export const SEMILLA = 'JBSWY3DPEHPK3PXP';

export const NEGOCIO: Negocio = {
  id: 'negocio-a',
  estado: 'activo',
  canje_cualquier_local: true,
};

export const LOCAL: Local = { id: 'local-1', negocio_id: NEGOCIO.id, activo: true };

export const DISPOSITIVO: Dispositivo = {
  id: 'tablet-1',
  local_id: LOCAL.id,
  revocado_el: null,
};

export const TURNO: Turno = {
  id: 'turno-1',
  dispositivo_id: DISPOSITIVO.id,
  usuario_id: 'cajero-1',
  local_id: LOCAL.id,
  rol: 'cajero',
  usuario_activo: true,
  // Abierto hace un rato y con actividad reciente: lejos de agotarse.
  ultima_actividad: new Date(AHORA.getTime() - 10 * 60_000),
  cerrado_el: null,
};

/** El mismo turno, abierto por un supervisor. */
export const TURNO_DE_SUPERVISOR: Turno = {
  ...TURNO,
  id: 'turno-2',
  usuario_id: 'supervisor-1',
  rol: 'supervisor',
};

export const ASIGNACION: Asignacion = {
  usuario_id: TURNO.usuario_id,
  local_id: LOCAL.id,
  activo: true,
};

export const CLIENTE: Cliente = {
  id: 'cliente-1',
  nombre: 'Juan',
  codigo_publico: 'K7Q4M',
  semilla_totp: SEMILLA,
};

export const PROGRAMA: Programa = {
  id: 'programa-v1',
  negocio_id: NEGOCIO.id,
  sellos_requeridos: 10,
  premio: 'Un cafe',
  vigencia_meses: 1,
  horas_entre_sellos: 4,
};

export const CONDICION: Condicion = { id: 'condicion-1', negocio_id: NEGOCIO.id };

/** El codigo que el cliente muestra en ese instante: prefijo mas TOTP. */
export function codigoValido(ahora: Date = AHORA, cliente: Cliente = CLIENTE): string {
  return `${cliente.codigo_publico}-${codigoDeVentana(cliente.semilla_totp, ventanaDe(ahora))}`;
}

export function unaTarjeta(cambios: Partial<Tarjeta> = {}): Tarjeta {
  return {
    id: 'tarjeta-1',
    cliente_id: CLIENTE.id,
    programa_id: PROGRAMA.id,
    negocio_id: NEGOCIO.id,
    local_alta_id: LOCAL.id,
    estado: 'activa',
    reloj_desde: null,
    vence_el: null,
    ...cambios,
  };
}

/** `cantidad` sellos no anulados, uno por dia hacia atras desde `hasta`. */
export function unosSellos(
  cantidad: number,
  opciones: { hasta?: Date; tarjeta_id?: string; anulados?: number } = {},
): Sello[] {
  const hasta = opciones.hasta ?? new Date(AHORA.getTime() - 24 * 3_600_000);
  const tarjeta_id = opciones.tarjeta_id ?? 'tarjeta-1';
  const total = cantidad + (opciones.anulados ?? 0);

  return Array.from({ length: total }, (_, indice) => ({
    id: `sello-${indice + 1}`,
    tarjeta_id,
    creado_el: new Date(hasta.getTime() - (total - 1 - indice) * 24 * 3_600_000),
    anulado: indice >= cantidad,
  }));
}

export function unaTarjetaEnCurso(cambios: Partial<TarjetaEnCurso> = {}): TarjetaEnCurso {
  const sellos = cambios.sellos ?? unosSellos(3);
  const primero = sellos.find((sello) => !sello.anulado);
  return {
    tarjeta:
      cambios.tarjeta ?? unaTarjeta(primero ? { reloj_desde: primero.creado_el } : {}),
    programa: cambios.programa ?? PROGRAMA,
    sellos,
  };
}

export function unaEntradaDeSellado(
  cambios: Partial<EntradaDeSellado> = {},
): EntradaDeSellado {
  return {
    ahora: AHORA,
    negocio: NEGOCIO,
    local: LOCAL,
    dispositivo: DISPOSITIVO,
    turno: TURNO,
    asignacion: ASIGNACION,
    cliente: CLIENTE,
    codigo: codigoValido(cambios.ahora ?? AHORA),
    codigoYaUsado: false,
    programaVigente: PROGRAMA,
    condicionVigente: CONDICION,
    enCurso: null,
    ultimoSelloDelCliente: null,
    ...cambios,
  };
}

export function unaEntradaDeCanje(cambios: Partial<EntradaDeCanje> = {}): EntradaDeCanje {
  return {
    ahora: AHORA,
    negocio: NEGOCIO,
    local: LOCAL,
    dispositivo: DISPOSITIVO,
    turno: TURNO,
    asignacion: ASIGNACION,
    cliente: CLIENTE,
    codigo: codigoValido(cambios.ahora ?? AHORA),
    codigoYaUsado: false,
    enCurso: unaTarjetaEnCurso({ sellos: unosSellos(PROGRAMA.sellos_requeridos) }),
    programaVigente: PROGRAMA,
    ...cambios,
  };
}

const MINUTO = 60_000;

/** Alguien que acaba de escanear el QR del mostrador. */
export const REGISTRO: RegistroPendiente = {
  id: 'registro-1',
  local_id: LOCAL.id,
  telefono: '+59170000001',
  nombre: 'Juan',
  estado: 'pendiente',
  expira_el: new Date(AHORA.getTime() + 30 * MINUTO),
};

export function unaEntradaDeAlta(cambios: Partial<EntradaDeAlta> = {}): EntradaDeAlta {
  return {
    ahora: AHORA,
    negocio: NEGOCIO,
    local: LOCAL,
    dispositivo: DISPOSITIVO,
    turno: TURNO,
    asignacion: ASIGNACION,
    registro: REGISTRO,
    sellar: false,
    clienteExistente: null,
    programaVigente: PROGRAMA,
    condicionVigente: CONDICION,
    enCurso: null,
    ultimoSelloDelCliente: null,
    ...cambios,
  };
}

/** El sello que el cajero acaba de otorgar, hace un minuto. */
export function unSelloParaAnular(
  cambios: Partial<SelloParaAnular> = {},
): SelloParaAnular {
  return {
    id: 'sello-3',
    tarjeta_id: 'tarjeta-1',
    local_id: LOCAL.id,
    usuario_id: TURNO.usuario_id,
    creado_el: new Date(AHORA.getTime() - MINUTO),
    anulado: false,
    tarjeta_estado: 'activa',
    ...cambios,
  };
}

export function unaEntradaDeAnulacion(
  cambios: Partial<EntradaDeAnulacion> = {},
): EntradaDeAnulacion {
  const sello = cambios.sello === undefined ? unSelloParaAnular() : cambios.sello;
  const sellos = unosSellos(3, { hasta: new Date(AHORA.getTime() - MINUTO) });
  const ultimo = sellos[sellos.length - 1];
  return {
    ahora: AHORA,
    negocio: NEGOCIO,
    local: LOCAL,
    dispositivo: DISPOSITIVO,
    turno: TURNO,
    asignacion: ASIGNACION,
    sello,
    // El ultimo que otorgo este cajero es el tercero, 'sello-3', que es el que
    // unSelloParaAnular() devuelve por defecto. Un test que pase otro id esta
    // probando justamente que ya no es el ultimo.
    ultimoSelloDelUsuario: ultimo ?? null,
    tarjeta: unaTarjetaEnCurso({ sellos }),
    nombreDelCliente: CLIENTE.nombre,
    programaDeLaTarjeta: PROGRAMA,
    ...cambios,
  };
}
