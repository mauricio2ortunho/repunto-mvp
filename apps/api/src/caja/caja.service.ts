import { Inject, Injectable } from '@nestjs/common';
import {
  type CanjearPeticion,
  type CanjearRespuesta,
  esquemaCanjearRespuesta,
  esquemaSellarRespuesta,
  type SellarPeticion,
  type SellarRespuesta,
} from '@repunto/contratos';
import {
  type EfectoDeCanje,
  type EfectoDeSellado,
  type EntradaDeCanje,
  type EntradaDeSellado,
  decidirCanje,
  decidirSello,
  partirCodigoTipeado,
  rechazo,
  verificarCodigo,
} from '@repunto/dominio';

import { PrismaService } from '../prisma/prisma.service';
import { errorDeApi, errorDeRechazo } from './errores-http';
import { guardarRespuesta, reservarIdempotencia } from './idempotencia';
import { type EstadoDeCaja, type Transaccion, leerEstado } from './lectura';

/**
 * El flujo de caja, de punta a punta. Todo lo que decide lo decide el dominio;
 * aca se lee, se escribe y se traduce.
 *
 * Todo ocurre en UNA transaccion (INV-19), y adentro siempre en este orden:
 *
 *  1. Leer el estado (una consulta).
 *  2. Reservar la clave de idempotencia, ya sabiendo de que tablet viene.
 *  3. Registrar el consumo del codigo ANTES de crear nada (INV-9).
 *  4. Decidir.
 *  5. Ejecutar el efecto.
 *
 * Si algo rechaza, la transaccion se deshace entera: no queda ni el consumo
 * del codigo ni la fila de idempotencia, asi que el reintento vuelve a decidir
 * con el estado del momento.
 */
@Injectable()
export class CajaService {
  // La inyeccion va por token explicito y no por el tipo: los tests compilan
  // con esbuild, que no emite `design:paramtypes`. Declararlo a mano evita
  // sumar un compilador mas solo para los tests.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async sellar(
    tokenHash: string,
    clave: string,
    cuerpo: SellarPeticion,
  ): Promise<SellarRespuesta> {
    return this.prisma.$transaction(async (tx) => {
      const estado = await leerEstado(tx, tokenHash, prefijoDe(cuerpo.codigo));
      if (estado === null) throw errorDeApi('TOKEN_INVALIDO');

      const peticion = {
        dispositivo_id: estado.dispositivo.id,
        endpoint: 'POST /caja/sellos',
        clave,
        cuerpo,
      };
      const guardada = await reservarIdempotencia(tx, peticion);
      if (guardada !== null) return esquemaSellarRespuesta.parse(guardada);

      const codigoYaUsado = await registrarConsumo(tx, estado, cuerpo.codigo);

      const entrada: EntradaDeSellado = {
        ahora: estado.ahora,
        negocio: estado.negocio,
        local: estado.local,
        dispositivo: estado.dispositivo,
        turno: estado.turno,
        asignacion: estado.asignacion,
        cliente: estado.cliente,
        codigo: cuerpo.codigo,
        codigoYaUsado,
        programaVigente: estado.programaVigente,
        condicionVigente: estado.condicionVigente,
        enCurso: estado.enCurso,
        ultimoSelloDelCliente: estado.ultimoSelloDelCliente,
      };

      const decision = decidirSello(entrada);
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, estado);

      const sello_id = await ejecutarSello(tx, decision.efecto);
      const respuesta = esquemaSellarRespuesta.parse({
        ...decision.efecto.aviso,
        sello_id,
      });
      await guardarRespuesta(tx, peticion, respuesta);
      return respuesta;
    });
  }

  async canjear(
    tokenHash: string,
    clave: string,
    cuerpo: CanjearPeticion,
  ): Promise<CanjearRespuesta> {
    return this.prisma.$transaction(async (tx) => {
      const estado = await leerEstado(tx, tokenHash, prefijoDe(cuerpo.codigo));
      if (estado === null) throw errorDeApi('TOKEN_INVALIDO');

      const peticion = {
        dispositivo_id: estado.dispositivo.id,
        endpoint: 'POST /caja/canjes',
        clave,
        cuerpo,
      };
      const guardada = await reservarIdempotencia(tx, peticion);
      if (guardada !== null) return esquemaCanjearRespuesta.parse(guardada);

      const codigoYaUsado = await registrarConsumo(tx, estado, cuerpo.codigo);

      const entrada: EntradaDeCanje = {
        ahora: estado.ahora,
        negocio: estado.negocio,
        local: estado.local,
        dispositivo: estado.dispositivo,
        turno: estado.turno,
        asignacion: estado.asignacion,
        cliente: estado.cliente,
        codigo: cuerpo.codigo,
        codigoYaUsado,
        enCurso: estado.enCurso,
        programaVigente: estado.programaVigente,
      };

      const decision = decidirCanje(entrada);
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, estado);

      await ejecutarCanje(tx, decision.efecto);
      const respuesta = esquemaCanjearRespuesta.parse(decision.efecto.aviso);
      await guardarRespuesta(tx, peticion, respuesta);
      return respuesta;
    });
  }
}

/**
 * El prefijo con el que se busca al cliente. Si lo tipeado no tiene forma de
 * codigo, se busca un prefijo vacio: no resuelve a nadie y el dominio rechaza
 * con CODIGO_INVALIDO, en el orden que le corresponde. La api no adelanta esa
 * decision: un dispositivo revocado tiene que enterarse de que esta revocado
 * aunque el codigo tambien este mal.
 */
function prefijoDe(tipeado: string): string {
  return partirCodigoTipeado(tipeado)?.codigo_publico ?? '';
}

/**
 * Registra el consumo del codigo antes de crear nada (INV-9) y devuelve si la
 * ventana ya estaba consumida.
 *
 * Esto escribe, asi que no puede vivir en el dominio; y para saber que ventana
 * registrar hay que verificar el TOTP, que es lo que hacen `partirCodigoTipeado`
 * y `verificarCodigo` —funciones del dominio— sin que ninguna regla se mude
 * para aca: el dominio vuelve a verificarlo al decidir.
 */
async function registrarConsumo(
  tx: Transaccion,
  estado: EstadoDeCaja,
  codigo: string,
): Promise<boolean> {
  const cliente = estado.cliente;
  const tipeado = partirCodigoTipeado(codigo);
  if (cliente === null || tipeado === null) return false;

  const verificacion = verificarCodigo({
    semilla: cliente.semilla_totp,
    totp: tipeado.totp,
    ahora: estado.ahora,
  });
  if (!verificacion.valido || verificacion.ventana === null) return false;

  const insertadas = await tx.$executeRaw`
    INSERT INTO codigo_usado (cliente_id, ventana, negocio_id)
    VALUES (${cliente.id}::uuid, ${verificacion.ventana}, ${estado.negocio.id}::uuid)
    ON CONFLICT DO NOTHING`;
  return insertadas === 0;
}

async function ejecutarSello(tx: Transaccion, efecto: EfectoDeSellado): Promise<string> {
  // La tarjeta vencida se cierra antes de abrir la nueva: si no, chocarian en
  // el indice de INV-11. Cero filas afectadas significa que el cron llego
  // primero, que es exactamente lo mismo.
  if (efecto.vencerTarjeta !== null) {
    await tx.$executeRaw`
      UPDATE tarjeta SET estado = 'vencida'
      WHERE id = ${efecto.vencerTarjeta}::uuid AND estado = 'activa'`;
  }

  let tarjeta = efecto.tarjeta_id;
  const abrir = efecto.abrirTarjeta;
  if (abrir !== null) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id)
      VALUES (${abrir.cliente_id}::uuid, ${abrir.programa_id}::uuid,
              ${abrir.negocio_id}::uuid, ${abrir.local_alta_id}::uuid)
      RETURNING id`;
    tarjeta = filas[0]?.id ?? null;
  }
  if (tarjeta === null) throw new Error('Un sello sin tarjeta donde ponerlo.');

  // Devuelve su id: es lo que el panel necesita para el boton de deshacer, y
  // pedirlo despues costaria un viaje mas en la accion mas frecuente de la caja.
  const sellos = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO sello (tarjeta_id, negocio_id, local_id, turno_id, condicion_id)
    VALUES (${tarjeta}::uuid, ${efecto.sello.negocio_id}::uuid,
            ${efecto.sello.local_id}::uuid, ${efecto.sello.turno_id}::uuid,
            ${efecto.sello.condicion_id}::uuid)
    RETURNING id`;
  const sello = sellos[0]?.id;
  if (sello === undefined) throw new Error('El sello no se creo.');

  const reloj = efecto.arrancarReloj;
  if (reloj !== null) {
    await tx.$executeRaw`
      UPDATE tarjeta SET reloj_desde = ${reloj.reloj_desde}, vence_el = ${reloj.vence_el}
      WHERE id = ${tarjeta}::uuid`;
  }

  return sello;
}

async function ejecutarCanje(tx: Transaccion, efecto: EfectoDeCanje): Promise<void> {
  // INV-16: cero filas afectadas es que alguien ya canjeo esta tarjeta entre
  // la lectura y ahora. El codigo es el mismo que devolveria el dominio si
  // volviera a leer: sin tarjeta activa, no hay canje.
  const cerradas = await tx.$executeRaw`
    UPDATE tarjeta SET estado = 'canjeada'
    WHERE id = ${efecto.tarjeta_id}::uuid AND estado = 'activa'`;
  if (cerradas === 0) throw errorDeRechazo(rechazo('TARJETA_INCOMPLETA'), null);

  const nueva = efecto.tarjetaNueva;
  const filas = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id,
                         reloj_desde, vence_el)
    VALUES (${nueva.cliente_id}::uuid, ${nueva.programa_id}::uuid,
            ${nueva.negocio_id}::uuid, ${nueva.local_alta_id}::uuid,
            ${nueva.reloj_desde}, ${nueva.vence_el})
    RETURNING id`;
  const tarjetaNueva = filas[0]?.id;
  if (tarjetaNueva === undefined) throw new Error('La tarjeta nueva no se creo.');

  // Los sobrantes se mudan con su fecha y su local originales (INV-15).
  for (const sello of efecto.sobrantes) {
    await tx.$executeRaw`
      UPDATE sello SET tarjeta_id = ${tarjetaNueva}::uuid WHERE id = ${sello}::uuid`;
  }

  await tx.$executeRaw`
    INSERT INTO canje (tarjeta_id, negocio_id, local_id, turno_id, premio_texto)
    VALUES (${efecto.tarjeta_id}::uuid, ${efecto.canje.negocio_id}::uuid,
            ${efecto.canje.local_id}::uuid, ${efecto.canje.turno_id}::uuid,
            ${efecto.canje.premio_texto})`;
}
