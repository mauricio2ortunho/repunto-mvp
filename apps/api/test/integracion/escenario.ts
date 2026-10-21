import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import {
  LARGO_CODIGO_DE_VINCULACION,
  codigoDeVentana,
  codigoDeVinculacionDesde,
  ventanaDe,
} from '@repunto/dominio';

import { cifrarSemilla } from '../../src/seguridad/cifrado';
import { hashDePin } from '../../src/seguridad/pin';
import { hashDeToken, nuevoToken } from '../../src/seguridad/token';
import { type Db, una } from './base';

/**
 * Constructores de datos para los tests de integracion. Todo se inserta con
 * SQL directo dentro de la transaccion del test, y se deshace con ella.
 *
 * Los valores que tienen que ser unicos (telefonos, slugs, tokens, codigos)
 * son distintos en cada llamada, asi un test puede crear varios negocios o
 * clientes sin chocar consigo mismo.
 */

/** Un negocio con toda la cadena que necesita un sello. */
export interface NegocioDePrueba {
  id: string;
  /** Local principal: el cajero trabaja aca. */
  local: string;
  /** Segundo local del mismo negocio: el cajero NO esta asignado aca. */
  otroLocal: string;
  /** Tiene telefono y no esta asignado a ningun local. */
  dueno: string;
  /** Asignado solo a `local`. */
  cajero: string;
  /** Asignado a `local` y a `otroLocal`. */
  supervisor: string;
  /** Tablet de `local`. */
  dispositivo: string;
  /** El token en claro de esa tablet: es lo que manda en la cabecera. */
  token: string;
  /** Tablet de `otroLocal`. */
  dispositivoOtroLocal: string;
  tokenOtroLocal: string;
  /** Turno abierto del cajero en la tablet de `local`. */
  turno: string;
  /** Turno abierto del supervisor en la tablet de `otroLocal`. */
  turnoOtroLocal: string;
  /** Version 1, vigente. */
  programa: string;
  condicion: string;
}

/**
 * Telefono boliviano en E.164, distinto en cada llamada. Al azar y no por
 * contador: el telefono es unico global, y dos procesos de Vitest con su
 * propio contador chocarian entre si.
 */
export function telefono(): string {
  return `+5917${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

/** Texto unico corto, para slugs, tokens y codigos. */
export function unico(prefijo: string): string {
  return `${prefijo}-${randomUUID()}`;
}

async function insertar(
  db: Db,
  sql: string,
  parametros: readonly unknown[],
): Promise<string> {
  const { id } = await una<{ id: string }>(db, sql, parametros);
  return id;
}

export async function crearNegocio(
  db: Db,
  nombre = 'Negocio de prueba',
): Promise<NegocioDePrueba> {
  const id = await insertar(
    db,
    `INSERT INTO negocio (nombre, categoria, color_principal, plantilla_tarjeta, icono_sello)
     VALUES ($1, 'cafe', '#1A2B3C', 'clasica', 'cafe') RETURNING id`,
    [nombre],
  );

  const local = await crearLocal(db, id, 'Equipetrol');
  const otroLocal = await crearLocal(db, id, 'Centro');

  const dueno = await crearUsuario(db, id, 'dueno', telefono());
  const cajero = await crearUsuario(db, id, 'cajero', null);
  const supervisor = await crearUsuario(db, id, 'supervisor', null);

  await asignar(db, cajero, local, id);
  await asignar(db, supervisor, local, id);
  await asignar(db, supervisor, otroLocal, id);

  const token = nuevoToken();
  const tokenOtroLocal = nuevoToken();
  const dispositivo = await crearDispositivo(db, local, token);
  const dispositivoOtroLocal = await crearDispositivo(db, otroLocal, tokenOtroLocal);

  const turno = await abrirTurno(db, dispositivo, cajero, local);
  const turnoOtroLocal = await abrirTurno(
    db,
    dispositivoOtroLocal,
    supervisor,
    otroLocal,
  );

  const programa = await insertar(
    db,
    `INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente)
     VALUES ($1, 1, 10, 'Un cafe', 4, true) RETURNING id`,
    [id],
  );
  const condicion = await insertar(
    db,
    `INSERT INTO condicion_sello (negocio_id, texto, vigente_desde, usuario_id)
     VALUES ($1, 'Cualquier capuchino', now(), $2) RETURNING id`,
    [id, dueno],
  );

  return {
    id,
    local,
    otroLocal,
    dueno,
    cajero,
    supervisor,
    dispositivo,
    token,
    dispositivoOtroLocal,
    tokenOtroLocal,
    turno,
    turnoOtroLocal,
    programa,
    condicion,
  };
}

/** Le pone PIN a un usuario. Sin PIN, no aparece en la lista de la tablet. */
export async function ponerPin(db: Db, usuario: string, pin: string): Promise<void> {
  await db.query('UPDATE usuario_negocio SET pin_hash = $1 WHERE id = $2', [
    await hashDePin(pin),
    usuario,
  ]);
}

export async function crearLocal(
  db: Db,
  negocio: string,
  nombre: string,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO local (negocio_id, nombre, direccion, qr_slug)
     VALUES ($1, $2, 'Santa Cruz de la Sierra', $3) RETURNING id`,
    [negocio, nombre, unico('qr')],
  );
}

export async function crearUsuario(
  db: Db,
  negocio: string,
  rol: 'dueno' | 'supervisor' | 'cajero',
  tel: string | null,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO usuario_negocio (negocio_id, rol, telefono, nombre)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [negocio, rol, tel, `${rol} de prueba`],
  );
}

export async function asignar(
  db: Db,
  usuario: string,
  local: string,
  negocio: string,
): Promise<void> {
  await db.query(
    'INSERT INTO usuario_local (usuario_id, local_id, negocio_id) VALUES ($1, $2, $3)',
    [usuario, local, negocio],
  );
}

export async function crearDispositivo(
  db: Db,
  local: string,
  token: string = nuevoToken(),
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el)
     VALUES ($1, 'Caja 1', $2, now()) RETURNING id`,
    [local, hashDeToken(token)],
  );
}

export async function abrirTurno(
  db: Db,
  dispositivo: string,
  usuario: string,
  local: string,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO turno_caja (dispositivo_id, usuario_id, local_id, abierto_el)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [dispositivo, usuario, local],
  );
}

/**
 * Cierra un turno. Hace falta antes de intentar abrir otro en la misma tablet:
 * el indice parcial turno_caja_uno_abierto_por_dispositivo se evalua antes que
 * las FK, y taparia la restriccion que el test quiere probar.
 */
export async function cerrarTurno(db: Db, turno: string): Promise<void> {
  await db.query('UPDATE turno_caja SET cerrado_el = now() WHERE id = $1', [turno]);
}

/**
 * Cambia quien esta en la caja: cierra el turno abierto de la tablet y abre
 * otro para ese usuario. Hace falta porque una tablet tiene un solo turno
 * abierto a la vez, y devuelve el negocio con su turno nuevo.
 */
export async function conTurnoDe(
  db: Db,
  negocio: NegocioDePrueba,
  usuario: string,
): Promise<NegocioDePrueba> {
  await cerrarTurno(db, negocio.turno);
  const turno = await abrirTurno(db, negocio.dispositivo, usuario, negocio.local);
  return { ...negocio, turno };
}

/** Un admin de plataforma: no pertenece a ningun negocio. */
/**
 * Un codigo de vinculacion para un local, generado por el admin. `minutos`
 * negativos lo crean ya vencido: nacio hace media hora.
 */
export async function crearCodigoDeVinculacion(
  db: Db,
  local: string,
  { minutos = 15, admin }: { minutos?: number; admin?: string } = {},
): Promise<{ id: string; codigo: string; admin: string }> {
  const creador = admin ?? (await crearAdmin(db));
  const codigo = codigoDeVinculacionDesde(randomBytes(LARGO_CODIGO_DE_VINCULACION));
  const { id } = await una<{ id: string }>(
    db,
    `INSERT INTO vinculacion_pendiente (codigo, local_id, creado_por_admin_id, creado_el, expira_el)
     VALUES ($1, $2, $3, now() - interval '30 minutes',
             now() + make_interval(mins => $4::int))
     RETURNING id`,
    [codigo, local, creador, minutos],
  );
  return { id, codigo, admin: creador };
}

export async function crearAdmin(db: Db): Promise<string> {
  return insertar(
    db,
    `INSERT INTO admin_plataforma (telefono, nombre) VALUES ($1, 'Admin') RETURNING id`,
    [telefono()],
  );
}

// Base32, como exige el TOTP. Distinta en cada cliente: si dos compartieran
// semilla, el codigo de uno serviria para el otro y los tests de codigo
// invalido no probarian nada.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function nuevaSemilla(): string {
  return Array.from({ length: 16 }, () => BASE32[randomInt(0, BASE32.length)]).join('');
}

export interface ClienteDePrueba {
  id: string;
  nombre: string;
  codigo_publico: string;
  /** Su semilla TOTP en claro; en la base esta cifrada. */
  semilla: string;
  /** Token en claro de la sesion de su telefono. */
  token: string;
}

export async function crearCliente(db: Db): Promise<string> {
  return (await crearClienteEnCaja(db)).id;
}

/**
 * Un cliente listo para mostrar su codigo: semilla cifrada como en produccion
 * y una sesion abierta en su telefono.
 */
export async function crearClienteEnCaja(
  db: Db,
  nombre = 'Juan',
): Promise<ClienteDePrueba> {
  const codigo_publico = codigoPublico();
  const semilla = nuevaSemilla();
  const id = await insertar(
    db,
    `INSERT INTO cliente (telefono, nombre, semilla_totp, codigo_publico)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [telefono(), nombre, cifrarSemilla(semilla), codigo_publico],
  );
  const token = nuevoToken();
  await db.query(
    `INSERT INTO dispositivo_cliente (cliente_id, token_hash, ultimo_acceso, origen)
     VALUES ($1, $2, now(), 'codigo')`,
    [id, hashDeToken(token)],
  );
  return { id, nombre, codigo_publico, semilla, token };
}

/** El codigo que ese cliente muestra en ese instante. */
export function codigoDe(cliente: ClienteDePrueba, ahora: Date = new Date()): string {
  return `${cliente.codigo_publico}-${codigoDeVentana(cliente.semilla, ventanaDe(ahora))}`;
}

/** El de la ventana anterior, que el dominio tambien acepta. */
export function codigoAnteriorDe(
  cliente: ClienteDePrueba,
  ahora: Date = new Date(),
): string {
  return `${cliente.codigo_publico}-${codigoDeVentana(cliente.semilla, ventanaDe(ahora) - 1)}`;
}

// Alfabeto sin ambiguos, igual que el CHECK. El dominio genera estos codigos
// en produccion; aca solo hacen falta distintos entre si. Al azar, por lo
// mismo que el telefono: 29^5 son 20 millones de combinaciones.
const ALFABETO = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';

/** Codigo publico valido y distinto en cada llamada. */
export function codigoPublico(): string {
  return Array.from({ length: 5 }, () => ALFABETO[randomInt(0, ALFABETO.length)]).join(
    '',
  );
}

/** Alguien que escaneo el QR y dejo su telefono. Pendiente de confirmacion. */
export async function crearRegistro(
  db: Db,
  local: string,
  opciones: { telefono?: string; nombre?: string; minutos?: number } = {},
): Promise<{ id: string; telefono: string; ticket: string }> {
  const tel = opciones.telefono ?? telefono();
  const ticket = nuevoToken();
  const id = await insertar(
    db,
    `INSERT INTO registro_pendiente (local_id, telefono, nombre, ticket_hash, expira_el)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5::int)) RETURNING id`,
    [local, tel, opciones.nombre ?? 'Juan', hashDeToken(ticket), opciones.minutos ?? 30],
  );
  return { id, telefono: tel, ticket };
}

/** Tarjeta activa, sin sellos: sin reloj ni vencimiento. */
export async function crearTarjeta(
  db: Db,
  cliente: string,
  negocio: NegocioDePrueba,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [cliente, negocio.programa, negocio.id, negocio.local],
  );
}

/**
 * Sello coherente: en el local del turno del cajero, con la condicion vigente.
 * `haceHoras` lo antedata, para armar tarjetas que ya pasaron el intervalo
 * minimo entre sellos.
 */
export async function crearSello(
  db: Db,
  tarjeta: string,
  negocio: NegocioDePrueba,
  haceHoras = 0,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id, creado_el)
     VALUES ($1, $2, $3, $4, $5, now() - make_interval(hours => $6::int)) RETURNING id`,
    [tarjeta, negocio.id, negocio.local, negocio.turno, negocio.condicion, haceHoras],
  );
}

/** `cantidad` sellos viejos sobre la misma tarjeta, uno por dia hacia atras. */
export async function crearSellos(
  db: Db,
  tarjeta: string,
  negocio: NegocioDePrueba,
  cantidad: number,
): Promise<string[]> {
  const sellos: string[] = [];
  for (let i = 0; i < cantidad; i += 1) {
    sellos.push(await crearSello(db, tarjeta, negocio, 24 * (cantidad - i)));
  }
  return sellos;
}

/** Tarjeta cuyo reloj arranco hace 40 dias y que vencio ayer. */
export async function crearTarjetaVencida(
  db: Db,
  cliente: string,
  negocio: NegocioDePrueba,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id, reloj_desde, vence_el)
     VALUES ($1, $2, $3, $4, now() - interval '40 days', now() - interval '1 day')
     RETURNING id`,
    [cliente, negocio.programa, negocio.id, negocio.local],
  );
}

export async function crearCanje(
  db: Db,
  tarjeta: string,
  negocio: NegocioDePrueba,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO canje (tarjeta_id, negocio_id, local_id, turno_id, premio_texto)
     VALUES ($1, $2, $3, $4, 'Un cafe') RETURNING id`,
    [tarjeta, negocio.id, negocio.local, negocio.turno],
  );
}

/** Dos negocios completos y un cliente con una tarjeta en A que ya tiene un sello. */
export interface Escenario {
  a: NegocioDePrueba;
  b: NegocioDePrueba;
  cliente: string;
  tarjeta: string;
  sello: string;
}

export async function escenario(db: Db): Promise<Escenario> {
  const a = await crearNegocio(db, 'Cafe A');
  const b = await crearNegocio(db, 'Pollos B');
  const cliente = await crearCliente(db);
  const tarjeta = await crearTarjeta(db, cliente, a);
  const sello = await crearSello(db, tarjeta, a);
  return { a, b, cliente, tarjeta, sello };
}
