import type { EstadoDelRegistro } from '@repunto/contratos';

/**
 * Que hace la app despues de preguntar por su registro. Es una funcion pura,
 * aparte de la pantalla, para poder probar cada caso sin navegador.
 */

export type MotivoDeFin =
  /** Nadie lo confirmo dentro de la media hora. */
  | 'vencido'
  /** El cajero lo descarto. */
  | 'descartado'
  /**
   * El telefono ya tenia cuenta y este equipo no tiene sesion: la confirmacion
   * presencial no da la sesion de una cuenta que ya existe (CLAUDE.md, seccion
   * 5), y el ingreso por codigo todavia no existe.
   */
  | 'ya_tiene_cuenta'
  /** Confirmado, pero la sesion ya se entrego antes y este equipo no la tiene. */
  | 'sin_sesion';

export type Siguiente =
  | { tipo: 'seguir_esperando' }
  /** Entrar a la app. `token` es la sesion nueva, o null si ya habia una. */
  | { tipo: 'entrar'; token: string | null }
  | { tipo: 'terminar'; motivo: MotivoDeFin };

export function queSigue(estado: EstadoDelRegistro, tieneSesion: boolean): Siguiente {
  switch (estado.estado) {
    case 'pendiente':
      return { tipo: 'seguir_esperando' };
    case 'vencido':
      return { tipo: 'terminar', motivo: 'vencido' };
    case 'descartado':
      return { tipo: 'terminar', motivo: 'descartado' };
    case 'confirmado':
      // El token llega una sola vez. Si no vino pero este telefono ya tiene
      // sesion, la tarjeta nueva igual aparece en su lista.
      if (estado.token !== undefined) return { tipo: 'entrar', token: estado.token };
      return tieneSesion
        ? { tipo: 'entrar', token: null }
        : { tipo: 'terminar', motivo: 'sin_sesion' };
    case 'verificacion_requerida':
      // Un cliente con cuenta que se anota en otro negocio (especificacion,
      // seccion 3): el cajero le abrio la tarjeta, y si este telefono ya es
      // suyo, la va a ver en su lista. Si no, no hay como entrar todavia.
      return tieneSesion
        ? { tipo: 'entrar', token: null }
        : { tipo: 'terminar', motivo: 'ya_tiene_cuenta' };
  }
}

/** Lo que el cajero ve en su lista: los ultimos cuatro digitos de lo tipeado. */
export function ultimosCuatroDe(telefono: string): string {
  return telefono.replace(/\D/g, '').slice(-4);
}
