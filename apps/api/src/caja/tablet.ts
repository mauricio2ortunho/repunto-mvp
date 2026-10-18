import { rechazo, revisarTablet } from '@repunto/dominio';

import { type PrismaService } from '../prisma/prisma.service';
import { errorDeApi, errorDeRechazo } from './errores-http';

interface FilaDeTablet {
  id: string;
  local_id: string;
  revocado_el: Date | null;
  negocio_id: string;
  activo: boolean;
}

/**
 * Para las lecturas de la caja que no necesitan turno —la lista de registros,
 * los sellos recientes—: falla si el token no es de ninguna tablet, si la
 * tablet fue revocada o si su local se dio de baja.
 *
 * Sin esto, una tablet perdida y revocada seguia viendo nombres de clientes.
 * Quien decide es `revisarTablet`, la misma regla con la que arranca el
 * sellado.
 */
export async function exigirTablet(
  prisma: Pick<PrismaService, '$queryRaw'>,
  tokenHash: string,
): Promise<void> {
  const filas = await prisma.$queryRaw<FilaDeTablet[]>`
    SELECT d.id, d.local_id, d.revocado_el, l.negocio_id, l.activo
    FROM dispositivo_caja d JOIN local l ON l.id = d.local_id
    WHERE d.token_hash = ${tokenHash}`;

  const fila = filas[0];
  if (fila === undefined) throw errorDeApi('TOKEN_INVALIDO');

  const codigo = revisarTablet({
    dispositivo: { id: fila.id, local_id: fila.local_id, revocado_el: fila.revocado_el },
    local: { id: fila.local_id, negocio_id: fila.negocio_id, activo: fila.activo },
  });
  if (codigo !== null) throw errorDeRechazo(rechazo(codigo), null);
}
