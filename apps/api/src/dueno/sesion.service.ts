import { Inject, Injectable } from '@nestjs/common';
import {
  type EntrarComoDuenoRespuesta,
  esquemaEntrarComoDuenoRespuesta,
} from '@repunto/contratos';
import {
  decidirEntradaDeDueno,
  normalizarCodigoDeVinculacion,
  rechazo,
} from '@repunto/dominio';

import { errorDeRechazo } from '../caja/errores-http';
import { PrismaService } from '../prisma/prisma.service';
import { TopeDePeticiones } from '../seguridad/tope';
import { hashDeToken, nuevoToken } from '../seguridad/token';

/**
 * Intentos de entrada por IP y por hora. El mismo criterio que la entrada del
 * admin: holgado para quien se equivoca tipeando, corto para quien prueba
 * códigos al azar. El código vive 24 horas, pero a 20 intentos por hora no se
 * adivina uno de ocho caracteres en ese tiempo.
 */
export const TOPE_DE_ENTRADA_DE_DUENO_POR_IP = 20;

interface FilaDeEntrada {
  ahora: Date;
  id: string;
  usuario_id: string;
  expira_el: Date;
  usado_el: Date | null;
  usuario_activo: boolean;
}

/**
 * `POST /dueno/sesion` y `POST /dueno/sesion/cierre`. Quien decide si el
 * código sirve es `decidirEntradaDeDueno`; acá se lee, se marca y se crea la
 * sesión.
 */
@Injectable()
export class SesionDeDuenoService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TopeDePeticiones) private readonly tope: TopeDePeticiones,
  ) {}

  async entrar(tipeado: string, ip: string): Promise<EntrarComoDuenoRespuesta> {
    // Cuenta todo intento, bueno o malo, como en la entrada del admin.
    await this.tope.exigir(`entrada-dueno-ip:${ip}`, TOPE_DE_ENTRADA_DE_DUENO_POR_IP);

    const codigo = normalizarCodigoDeVinculacion(tipeado);
    if (codigo === null) throw errorDeRechazo(rechazo('ENTRADA_INVALIDA'), null);

    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: dos equipos con el mismo código a la vez se ordenan acá, y
      // el segundo lo ve usado. Detrás está igual sesion_dueno_entrada_id_key.
      const filas = await tx.$queryRaw<FilaDeEntrada[]>`
        SELECT now() AS ahora, e.id, e.usuario_id, e.expira_el, e.usado_el,
               u.activo AS usuario_activo
        FROM entrada_dueno e
        JOIN usuario_negocio u ON u.id = e.usuario_id
        WHERE e.codigo = ${codigo}
        FOR UPDATE OF e`;

      const fila = filas[0];
      const decision = decidirEntradaDeDueno({
        ahora: fila?.ahora ?? new Date(0),
        entrada: fila ?? null,
      });
      if (decision.tipo === 'rechazado') throw errorDeRechazo(decision, null);

      const { efecto } = decision;
      await tx.$executeRaw`
        UPDATE entrada_dueno SET usado_el = now()
        WHERE id = ${efecto.entrada_id}::uuid AND usado_el IS NULL`;

      const token = nuevoToken();
      await tx.$executeRaw`
        INSERT INTO sesion_dueno (usuario_id, token_hash, entrada_id, ultimo_acceso)
        VALUES (${efecto.usuario_id}::uuid, ${hashDeToken(token)},
                ${efecto.entrada_id}::uuid, now())`;

      return esquemaEntrarComoDuenoRespuesta.parse({ token });
    });
  }

  /** Cerrar la sesión propia: la revoca, no la borra. */
  async cerrar(sesionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE sesion_dueno SET revocada_el = now()
      WHERE id = ${sesionId}::uuid AND revocada_el IS NULL`;
  }
}
