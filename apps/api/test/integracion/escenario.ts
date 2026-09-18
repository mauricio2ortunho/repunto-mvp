import { randomUUID } from 'node:crypto';

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
  /** Tablet de `otroLocal`. */
  dispositivoOtroLocal: string;
  /** Turno abierto del cajero en la tablet de `local`. */
  turno: string;
  /** Turno abierto del supervisor en la tablet de `otroLocal`. */
  turnoOtroLocal: string;
  /** Version 1, vigente. */
  programa: string;
  condicion: string;
}

// No es estado de datos: la base arranca vacia en cada test y todo se deshace.
// El contador solo garantiza telefonos distintos dentro de un mismo test.
let ultimoTelefono = 0;

/** Telefono boliviano en E.164, distinto en cada llamada. */
export function telefono(): string {
  ultimoTelefono += 1;
  return `+5917${String(ultimoTelefono).padStart(7, '0')}`;
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

  const dispositivo = await crearDispositivo(db, local);
  const dispositivoOtroLocal = await crearDispositivo(db, otroLocal);

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
    dispositivoOtroLocal,
    turno,
    turnoOtroLocal,
    programa,
    condicion,
  };
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

export async function crearDispositivo(db: Db, local: string): Promise<string> {
  return insertar(
    db,
    `INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el)
     VALUES ($1, 'Caja 1', $2, now()) RETURNING id`,
    [local, unico('token')],
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

/** Un admin de plataforma: no pertenece a ningun negocio. */
export async function crearAdmin(db: Db): Promise<string> {
  return insertar(
    db,
    `INSERT INTO admin_plataforma (telefono, nombre) VALUES ($1, 'Admin') RETURNING id`,
    [telefono()],
  );
}

export async function crearCliente(db: Db): Promise<string> {
  return insertar(
    db,
    `INSERT INTO cliente (telefono, nombre, semilla_totp)
     VALUES ($1, 'Juan', 'semilla-cifrada') RETURNING id`,
    [telefono()],
  );
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

/** Sello coherente: en el local del turno del cajero, con la condicion vigente. */
export async function crearSello(
  db: Db,
  tarjeta: string,
  negocio: NegocioDePrueba,
): Promise<string> {
  return insertar(
    db,
    `INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tarjeta, negocio.id, negocio.local, negocio.turno, negocio.condicion],
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
