import type { CodigoDelCliente } from '@repunto/contratos';

/**
 * Cual de los dos codigos mostrar ahora, y cuanto le queda. Funcion pura,
 * aparte de la pantalla, para probarla sin navegador ni reloj.
 *
 * `ahora` es el reloj del SERVIDOR (ver lib/reloj.ts), no el del telefono.
 */

export type Vigente =
  | {
      tipo: 'mostrar';
      codigo: string;
      /** Milisegundos hasta que deja de ser el actual. */
      restanteMs: number;
      /** Fraccion de la ventana que queda, de 1 a 0: para la barra. */
      fraccion: number;
      /** Ya se esta mostrando el ultimo: hay que pedir los siguientes. */
      pedirMas: boolean;
    }
  /** Se vencieron los dos: no se muestra uno viejo. */
  | { tipo: 'vencidos' };

const VENTANA_MS = 30_000;

export function codigoVigente(datos: CodigoDelCliente, ahora: number): Vigente {
  const [primero, segundo] = datos.codigos;
  for (const [indice, codigo] of [primero, segundo].entries()) {
    if (codigo === undefined) continue;
    const restanteMs = Date.parse(codigo.vence_el) - ahora;
    if (restanteMs <= 0) continue;
    return {
      tipo: 'mostrar',
      codigo: codigo.codigo,
      restanteMs,
      fraccion: Math.min(1, restanteMs / VENTANA_MS),
      pedirMas: indice === 1,
    };
  }
  return { tipo: 'vencidos' };
}

/**
 * `K7Q4M-418329` en dos partes para leerlo en voz alta o tipearlo: el prefijo,
 * y los seis digitos en dos grupos de tres. La caja acepta el codigo con o sin
 * espacios ni guiones (CLAUDE.md, seccion 6).
 */
export function partesDelCodigo(codigo: string): { prefijo: string; digitos: string } {
  const [prefijo = codigo, totp = ''] = codigo.split('-');
  const digitos = totp.length === 6 ? `${totp.slice(0, 3)} ${totp.slice(3)}` : totp;
  return { prefijo, digitos };
}
