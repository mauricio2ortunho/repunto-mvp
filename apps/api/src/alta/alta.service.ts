import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  type ConfirmarRespuesta,
  type EstadoDelRegistro,
  type RegistroPeticion,
  type RegistroRespuesta,
  type RegistrosPendientes,
  esquemaConfirmarRespuesta,
  esquemaEstadoDelRegistro,
  esquemaRegistrosPendientes,
} from '@repunto/contratos';
import {
  type EfectoDeAlta,
  LARGO_CODIGO_PUBLICO,
  codigoPublicoDesde,
  decidirAlta,
  decidirDescarte,
  normalizarTelefono,
  rechazo,
  ultimosCuatro,
} from '@repunto/dominio';

import { type Transaccion, cteDeCaja } from '../caja/caja.sql';
import { errorDeApi, errorDeRechazo } from '../caja/errores-http';
import { guardarRespuesta, reservarIdempotencia } from '../caja/idempotencia';
import { PrismaService } from '../prisma/prisma.service';
import { cifrarSemilla } from '../seguridad/cifrado';
import { generarSemilla } from '../seguridad/semilla';
import {
  TOPE_DEL_TICKET,
  TOPE_POR_IP,
  TOPE_POR_TELEFONO,
  TopeDePeticiones,
} from '../seguridad/tope';
import { ticketDeRegistro } from '../seguridad/ticket';
import { hashDeToken, nuevoToken } from '../seguridad/token';
import { leerEstadoParaAlta } from './lectura';

/**
 * El alta del cliente en el mostrador (especificacion funcional, seccion 3).
 *
 * Tres momentos: el cliente escanea el QR y deja su telefono; el cajero lo ve
 * aparecer en su lista y lo confirma de cuerpo presente; el telefono del
 * cliente pregunta si ya lo confirmaron y recibe —o no— su sesion.
 */

/** Media hora: el cliente esta en la fila, no vuelve mañana. */
const MINUTOS_DE_VIDA = 30;

/**
 * Tope de pendientes visibles por local. `POST /registros` es publico y el QR
 * se puede fotografiar: sin esto, alguien llena la lista del cajero desde su
 * casa con telefonos distintos, y el cajero deja de poder usarla.
 */
const PENDIENTES_POR_LOCAL = 20;

/** Cuantos codigos publicos distintos se prueban antes de darse por vencido. */
const INTENTOS_DE_CODIGO = 5;

interface FilaDeRegistro {
  local_id: string | null;
  registro_id: string | null;
  /** El ticket y el nombre que quedaron en la fila, despues del insert o del
   * conflicto. Si el ticket no es el de esta peticion, la fila es de otro. */
  ticket_hash: string | null;
  nombre: string | null;
}

interface FilaDeTicket {
  id: string;
  estado: 'pendiente' | 'confirmado' | 'descartado';
  cliente_id: string | null;
  cliente_creado: boolean | null;
  sesion_entregada_el: Date | null;
  vencido: boolean;
}

@Injectable()
export class AltaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
  ) {}

  /**
   * `POST /registros`, el unico endpoint publico de la caja. La credencial es
   * el `qr_slug` impreso en el mostrador.
   */
  async registrar(
    peticion: RegistroPeticion,
    clave: string,
    ip: string,
  ): Promise<RegistroRespuesta> {
    const telefono = normalizarTelefono(peticion.telefono);
    if (telefono === null) throw errorDeRechazo(rechazo('TELEFONO_INVALIDO'), null);

    await this.tope.exigir(`registro-ip:${ip}`, TOPE_POR_IP);
    await this.tope.exigir(`registro-tel:${telefono}`, TOPE_POR_TELEFONO);

    // Derivado, no al azar: el reintento con la misma clave recibe el mismo
    // ticket sin que la base guarde nada en claro (ver `ticketDeRegistro`).
    const ticket = ticketDeRegistro(peticion.qr_slug, telefono, clave);
    const ticketHash = hashDeToken(ticket);

    // Una sola consulta: resuelve el local, cuenta los pendientes que ya hay e
    // inserta si entra.
    //
    // Si ese telefono ya tiene un registro esperando en el local, la fila NO
    // se reemplaza. Reemplazarla era el agujero: quien conociera el telefono
    // de alguien que se esta registrando lo anotaba de nuevo, se quedaba con
    // el ticket y se llevaba la sesion cuando el cajero confirmaba a la
    // persona de verdad. Solo se retoma una fila VENCIDA, cuyo dueño ya no
    // esta esperando.
    //
    // El DO UPDATE corre siempre, aunque no cambie nada, a proposito: asi el
    // RETURNING devuelve la fila tambien en el conflicto, y si otro pedido la
    // estaba insertando a la vez, Postgres espera a que termine y devuelve la
    // suya. Dentro del SET, `registro_pendiente.*` es la fila de antes.
    const filas = await this.prisma.$queryRaw<FilaDeRegistro[]>`
      WITH loc AS (
        SELECT l.id FROM local l WHERE l.qr_slug = ${peticion.qr_slug} AND l.activo
      ), cupo AS (
        SELECT count(*) AS n
        FROM registro_pendiente r, loc
        WHERE r.local_id = loc.id AND r.estado = 'pendiente'
          AND r.expira_el > now() AND r.telefono <> ${telefono}
      ), ins AS (
        INSERT INTO registro_pendiente (local_id, telefono, nombre, ticket_hash, expira_el)
        SELECT loc.id, ${telefono}, ${peticion.nombre}, ${ticketHash},
               now() + make_interval(mins => ${MINUTOS_DE_VIDA})
        FROM loc, cupo
        WHERE cupo.n < ${PENDIENTES_POR_LOCAL}
        ON CONFLICT (telefono, local_id) WHERE estado = 'pendiente'
        DO UPDATE SET
          nombre = CASE WHEN registro_pendiente.expira_el <= now()
                        THEN EXCLUDED.nombre ELSE registro_pendiente.nombre END,
          ticket_hash = CASE WHEN registro_pendiente.expira_el <= now()
                             THEN EXCLUDED.ticket_hash ELSE registro_pendiente.ticket_hash END,
          creado_el = CASE WHEN registro_pendiente.expira_el <= now()
                           THEN now() ELSE registro_pendiente.creado_el END,
          expira_el = CASE WHEN registro_pendiente.expira_el <= now()
                           THEN EXCLUDED.expira_el ELSE registro_pendiente.expira_el END
        RETURNING id, ticket_hash, nombre
      )
      SELECT (SELECT id FROM loc) AS local_id,
             (SELECT id FROM ins) AS registro_id,
             (SELECT ticket_hash FROM ins) AS ticket_hash,
             (SELECT nombre FROM ins) AS nombre`;

    const fila = filas[0];
    // El QR no resuelve a ningun local activo. Es un error del que escanea, no
    // un secreto: los qr_slug estan impresos en los mostradores.
    if (fila === undefined || fila.local_id === null)
      throw errorDeApi('PETICION_INVALIDA');

    // Si el local llego al tope, la respuesta es la misma de siempre: quien
    // esta llenando la lista no tiene por que enterarse de que dejo de entrar.
    if (fila.registro_id === null) return { estado: 'pendiente', ticket };

    // La fila es de otro equipo: el registro de esa persona sigue intacto.
    if (fila.ticket_hash !== ticketHash) {
      throw errorDeRechazo(rechazo('REGISTRO_EN_CURSO'), null);
    }
    // Misma clave con otro nombre: no es un reintento (CLAUDE.md, seccion 9).
    if (fila.nombre !== peticion.nombre) throw errorDeApi('IDEMPOTENCIA_DISTINTA');

    return { estado: 'pendiente', ticket };
  }

  /**
   * `GET /registros/mio`: como el telefono del cliente se entera de que lo
   * confirmaron.
   *
   * La sesion se entrega SOLO si esta confirmacion creo la cuenta. Si el
   * telefono ya era de alguien, hace falta verificarlo por codigo: si no,
   * cualquiera en la fila podria escribir el telefono de otro, dejar que el
   * cajero confirme un nombre razonable y llevarse la cuenta ajena entera.
   */
  async estadoDelRegistro(ticketHash: string): Promise<EstadoDelRegistro> {
    await this.tope.exigir(`ticket:${ticketHash}`, TOPE_DEL_TICKET);

    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<FilaDeTicket[]>`
        SELECT r.id, r.estado, r.cliente_id, r.cliente_creado, r.sesion_entregada_el,
               r.expira_el <= now() AS vencido
        FROM registro_pendiente r
        WHERE r.ticket_hash = ${ticketHash}`;

      const registro = filas[0];
      if (registro === undefined) throw errorDeApi('TOKEN_INVALIDO');

      if (registro.estado === 'descartado') return { estado: 'descartado' as const };
      if (registro.estado === 'pendiente') {
        return registro.vencido
          ? ({ estado: 'vencido' } as const)
          : ({ estado: 'pendiente' } as const);
      }

      // Confirmado sobre una cuenta que ya existia: manda el codigo.
      if (registro.cliente_creado !== true || registro.cliente_id === null) {
        return { estado: 'verificacion_requerida' as const };
      }

      // La sesion se entrega una sola vez. El WHERE con IS NULL es lo que
      // impide que dos pedidos simultaneos se lleven dos sesiones.
      const entregadas = await tx.$executeRaw`
        UPDATE registro_pendiente SET sesion_entregada_el = now()
        WHERE id = ${registro.id}::uuid AND sesion_entregada_el IS NULL`;
      if (entregadas === 0) return { estado: 'confirmado' as const };

      const token = nuevoToken();
      await tx.$executeRaw`
        INSERT INTO dispositivo_cliente (cliente_id, token_hash, ultimo_acceso, origen)
        VALUES (${registro.cliente_id}::uuid, ${hashDeToken(token)}, now(), 'presencial')`;

      return esquemaEstadoDelRegistro.parse({ estado: 'confirmado', token });
    });
  }

  /** `GET /caja/registros`: la lista que el cajero mira. */
  async pendientes(tokenHash: string): Promise<RegistrosPendientes> {
    const filas = await this.prisma.$queryRaw<
      { id: string; nombre: string; telefono: string; creado_el: Date }[]
    >`
      WITH ${cteDeCaja(tokenHash)}
      SELECT r.id, r.nombre, r.telefono, r.creado_el
      FROM registro_pendiente r, loc
      WHERE r.local_id = loc.id AND r.estado = 'pendiente' AND r.expira_el > now()
      ORDER BY r.creado_el
      LIMIT ${PENDIENTES_POR_LOCAL}`;

    // El token no resuelve a ninguna tablet: la consulta no devuelve nada,
    // pero tampoco tiene por que devolver nada un local sin registros. Se
    // distingue con una consulta al dispositivo solo cuando la lista viene
    // vacia, que es el caso barato.
    if (filas.length === 0) await this.exigirDispositivo(tokenHash);

    return esquemaRegistrosPendientes.parse({
      registros: filas.map((fila) => ({
        id: fila.id,
        nombre: fila.nombre,
        // Nunca el telefono entero: con tres personas registrandose a la vez,
        // el cajero pregunta "terminado en 4521?" y con eso alcanza.
        telefono_final: ultimosCuatro(fila.telefono),
        creado_el: fila.creado_el.toISOString(),
      })),
    });
  }

  /** `POST /caja/registros/:id/confirmar`. */
  async confirmar(
    tokenHash: string,
    clave: string,
    registroId: string,
    sellar: boolean,
  ): Promise<ConfirmarRespuesta> {
    return this.prisma.$transaction(async (tx) => {
      const estado = await leerEstadoParaAlta(tx, tokenHash, registroId);
      if (estado === null) throw errorDeApi('TOKEN_INVALIDO');

      const peticion = {
        dispositivo_id: estado.dispositivo.id,
        endpoint: 'POST /caja/registros/confirmar',
        clave,
        cuerpo: { registroId, sellar },
      };
      const guardada = await reservarIdempotencia(tx, peticion);
      if (guardada !== null) return esquemaConfirmarRespuesta.parse(guardada);

      const decision = decidirAlta({
        ahora: estado.ahora,
        negocio: estado.negocio,
        local: estado.local,
        dispositivo: estado.dispositivo,
        turno: estado.turno,
        asignacion: estado.asignacion,
        registro: estado.registro,
        sellar,
        clienteExistente: estado.clienteExistente,
        programaVigente: estado.programaVigente,
        condicionVigente: estado.condicionVigente,
        enCurso: estado.enCurso,
        ultimoSelloDelCliente: estado.ultimoSelloDelCliente,
      });
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);

      const respuesta = esquemaConfirmarRespuesta.parse(
        await ejecutarAlta(tx, decision.efecto),
      );
      await guardarRespuesta(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /** `POST /caja/registros/:id/descartar`. */
  async descartar(
    tokenHash: string,
    clave: string,
    registroId: string,
  ): Promise<{ estado: 'descartado' }> {
    return this.prisma.$transaction(async (tx) => {
      const estado = await leerEstadoParaAlta(tx, tokenHash, registroId);
      if (estado === null) throw errorDeApi('TOKEN_INVALIDO');

      const peticion = {
        dispositivo_id: estado.dispositivo.id,
        endpoint: 'POST /caja/registros/descartar',
        clave,
        cuerpo: { registroId },
      };
      const guardada = await reservarIdempotencia(tx, peticion);
      if (guardada !== null) return { estado: 'descartado' as const };

      const decision = decidirDescarte({
        ahora: estado.ahora,
        negocio: estado.negocio,
        local: estado.local,
        dispositivo: estado.dispositivo,
        turno: estado.turno,
        asignacion: estado.asignacion,
        registro: estado.registro,
      });
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);

      const descartados = await tx.$executeRaw`
        UPDATE registro_pendiente
        SET estado = 'descartado', resuelto_el = now(),
            resuelto_turno_id = ${decision.efecto.resuelto_turno_id}::uuid
        WHERE id = ${decision.efecto.registro_id}::uuid AND estado = 'pendiente'`;
      if (descartados === 0) throw errorDeRechazo(rechazo('REGISTRO_YA_RESUELTO'), null);

      const respuesta = { estado: 'descartado' as const };
      await guardarRespuesta(tx, peticion, respuesta);
      return respuesta;
    });
  }

  /** Falla con 401 si ese token no es de ninguna tablet. */
  private async exigirDispositivo(tokenHash: string): Promise<void> {
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM dispositivo_caja WHERE token_hash = ${tokenHash}`;
    if (filas.length === 0) throw errorDeApi('TOKEN_INVALIDO');
  }
}

/**
 * Ejecuta el alta: crea la cuenta si hace falta, abre la tarjeta, sella si el
 * cajero lo pidio y marca el registro como confirmado.
 *
 * El `UPDATE ... WHERE estado = 'pendiente'` con filas afectadas es lo que
 * resuelve la carrera entre dos cajeros del mismo local mirando la misma
 * lista: el segundo se entera de que llego tarde.
 */
async function ejecutarAlta(
  tx: Transaccion,
  efecto: EfectoDeAlta,
): Promise<ConfirmarRespuesta> {
  let cliente = efecto.cliente_id;
  let creado = false;

  if (efecto.crearCliente !== null) {
    const nuevo = await crearCliente(tx, efecto.crearCliente);
    cliente = nuevo.id;
    creado = nuevo.creado;
  }
  if (cliente === null) throw new Error('Un alta sin cliente al que abrirle la tarjeta.');

  if (efecto.vencerTarjeta !== null) {
    await tx.$executeRaw`
      UPDATE tarjeta SET estado = 'vencida'
      WHERE id = ${efecto.vencerTarjeta}::uuid AND estado = 'activa'`;
  }

  let tarjeta: string | null = null;
  const abrir = efecto.abrirTarjeta;
  if (abrir !== null) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id)
      VALUES (${cliente}::uuid, ${abrir.programa_id}::uuid,
              ${abrir.negocio_id}::uuid, ${abrir.local_alta_id}::uuid)
      RETURNING id`;
    tarjeta = filas[0]?.id ?? null;
  }

  let sello_id: string | null = null;
  const sello = efecto.sello;
  if (sello !== null) {
    const destino = tarjeta ?? (await tarjetaActivaDe(tx, cliente, sello.negocio_id));
    const sellos = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id)
      VALUES (${destino}::uuid, ${sello.negocio_id}::uuid, ${sello.local_id}::uuid,
              ${sello.turno_id}::uuid, ${sello.condicion_id}::uuid)
      RETURNING id`;
    sello_id = sellos[0]?.id ?? null;
    if (sello_id === null) throw new Error('El sello no se creo.');

    const reloj = efecto.arrancarReloj;
    if (reloj !== null) {
      await tx.$executeRaw`
        UPDATE tarjeta SET reloj_desde = ${reloj.reloj_desde}, vence_el = ${reloj.vence_el}
        WHERE id = ${destino}::uuid`;
    }
  }

  const confirmados = await tx.$executeRaw`
    UPDATE registro_pendiente
    SET estado = 'confirmado', cliente_id = ${cliente}::uuid, cliente_creado = ${creado},
        resuelto_el = now(), resuelto_turno_id = ${efecto.resuelto_turno_id}::uuid
    WHERE id = ${efecto.registro_id}::uuid AND estado = 'pendiente'`;
  if (confirmados === 0) throw errorDeRechazo(rechazo('REGISTRO_YA_RESUELTO'), null);

  return { ...efecto.aviso, sello_id };
}

/**
 * Crea la cuenta con su codigo publico y su semilla, que son secretos y se
 * generan aca, no en el dominio.
 *
 * `ON CONFLICT DO NOTHING` sin blanco atrapa los dos choques posibles. Si el
 * que choco fue el telefono, es que alguien creo esa cuenta entre la lectura y
 * este insert —el mismo cliente registrandose en dos locales a la vez— y
 * entonces se usa la que quedo. Si fue el codigo publico, se prueba con otro.
 */
async function crearCliente(
  tx: Transaccion,
  datos: { telefono: string; nombre: string },
): Promise<{ id: string; creado: boolean }> {
  const semilla = cifrarSemilla(generarSemilla());

  for (let intento = 0; intento < INTENTOS_DE_CODIGO; intento += 1) {
    const codigo = codigoPublicoDesde(randomBytes(LARGO_CODIGO_PUBLICO));
    const filas = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO cliente (telefono, nombre, semilla_totp, codigo_publico)
      VALUES (${datos.telefono}, ${datos.nombre}, ${semilla}, ${codigo})
      ON CONFLICT DO NOTHING
      RETURNING id`;
    const creado = filas[0]?.id;
    if (creado !== undefined) return { id: creado, creado: true };

    const existentes = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM cliente WHERE telefono = ${datos.telefono}`;
    const existente = existentes[0]?.id;
    if (existente !== undefined) return { id: existente, creado: false };
  }

  throw new Error(
    `No se consiguio un codigo publico libre en ${INTENTOS_DE_CODIGO} intentos.`,
  );
}

/** La tarjeta activa del cliente en ese negocio. Existe: la acaba de abrir o ya la tenia. */
async function tarjetaActivaDe(
  tx: Transaccion,
  cliente: string,
  negocio: string,
): Promise<string> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM tarjeta
    WHERE cliente_id = ${cliente}::uuid AND negocio_id = ${negocio}::uuid
      AND estado = 'activa'`;
  const tarjeta = filas[0]?.id;
  if (tarjeta === undefined) throw new Error('Un sello sin tarjeta donde ponerlo.');
  return tarjeta;
}
