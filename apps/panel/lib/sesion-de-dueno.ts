import {
  type AlmacenDeSesion,
  type SesionDeAdmin,
  almacenDelNavegador,
  crearSesionGuardada,
} from './sesion-de-admin';

/**
 * La sesión del panel del dueño, guardada en su celular. Aparte de la del
 * admin y de la credencial de la tablet: otra clave, y el cliente HTTP la
 * manda solo a /dueno. Si el dueño abre el panel en la tablet de su local,
 * cada una sigue con lo suyo.
 */

const CLAVE = 'repunto:dueno:token';

export type SesionDeDueno = SesionDeAdmin;

export function crearSesionDeDueno(almacen: AlmacenDeSesion | null): SesionDeDueno {
  return crearSesionGuardada(almacen, CLAVE);
}

let sesion: SesionDeDueno | null = null;

export function sesionDeDueno(): SesionDeDueno {
  sesion ??= crearSesionDeDueno(almacenDelNavegador());
  return sesion;
}
