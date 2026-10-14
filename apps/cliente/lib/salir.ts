import { sesionDelTelefono } from './sesion';
import { ultimoDelTelefono } from './ultimo';

/**
 * La sesion ya no vale (la api respondio TOKEN_INVALIDO): se olvida, y con
 * ella lo guardado para verse sin conexion. Las tarjetas de un cliente no se
 * le muestran a quien use el telefono despues.
 */
export function cerrarSesionDelTelefono(): void {
  sesionDelTelefono().cerrar();
  ultimoDelTelefono().olvidarTodo();
}
