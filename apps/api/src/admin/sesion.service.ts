import { Inject, Injectable } from '@nestjs/common';
import {
  type EntrarComoAdminRespuesta,
  esquemaEntrarComoAdminRespuesta,
} from '@repunto/contratos';
import {
  decidirEntradaDeAdmin,
  normalizarCodigoDeVinculacion,
  rechazo,
} from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { TopeDePeticiones } from '../seguridad/tope';
import { hashDeToken, nuevoToken } from '../seguridad/token';

/**
 * Intentos de entrada por IP y por hora. El mismo criterio que la vinculacion
 * de tablets: holgado para quien se equivoca tipeando, corto para quien
 * prueba codigos al azar.
 */
export const TOPE_DE_ENTRADA_DE_ADMIN_POR_IP = 20;

interface FilaDeEntrada {
  ahora: Date;
  id: string;
  admin_id: string;
  expira_el: Date;
  usado_el: Date | null;
  admin_activo: boolean;
}

/**
 * `POST /admin/sesion` y `POST /admin/sesion/cierre`. Quien decide si el
 * codigo sirve es `decidirEntradaDeAdmin`; aca se lee, se marca y se crea la
 * sesion.
 */
@Injectable()
export class SesionDeAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
  ) {}

  async entrar(tipeado: string, ip: string): Promise<EntrarComoAdminRespuesta> {
    // Cuenta todo intento, bueno o malo, como en la vinculacion.
    await this.tope.exigir(`entrada-admin-ip:${ip}`, TOPE_DE_ENTRADA_DE_ADMIN_POR_IP);

    const codigo = normalizarCodigoDeVinculacion(tipeado);
    if (codigo === null) throw errorDeRechazo(rechazo('ENTRADA_INVALIDA'), null);

    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: dos equipos con el mismo codigo a la vez se ordenan aca, y
      // el segundo lo ve usado. Detras esta igual sesion_admin_entrada_id_key.
      const filas = await tx.$queryRaw<FilaDeEntrada[]>`
        SELECT now() AS ahora, e.id, e.admin_id, e.expira_el, e.usado_el,
               a.activo AS admin_activo
        FROM entrada_admin e
        JOIN admin_plataforma a ON a.id = e.admin_id
        WHERE e.codigo = ${codigo}
        FOR UPDATE OF e`;

      const fila = filas[0];
      const decision = decidirEntradaDeAdmin({
        ahora: fila?.ahora ?? new Date(0),
        entrada: fila ?? null,
      });
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);

      const { efecto } = decision;
      await tx.$executeRaw`
        UPDATE entrada_admin SET usado_el = now()
        WHERE id = ${efecto.entrada_id}::uuid AND usado_el IS NULL`;

      const token = nuevoToken();
      await tx.$executeRaw`
        INSERT INTO sesion_admin (admin_id, token_hash, entrada_id, ultimo_acceso)
        VALUES (${efecto.admin_id}::uuid, ${hashDeToken(token)},
                ${efecto.entrada_id}::uuid, now())`;

      return esquemaEntrarComoAdminRespuesta.parse({ token });
    });
  }

  /** Cerrar la sesion propia: la revoca, no la borra. */
  async cerrar(sesionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE sesion_admin SET revocada_el = now()
      WHERE id = ${sesionId}::uuid AND revocada_el IS NULL`;
  }
}
