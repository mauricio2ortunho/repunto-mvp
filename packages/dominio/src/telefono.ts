/**
 * El telefono se almacena en E.164 y se normaliza en el borde de la API, antes
 * de cualquier consulta (INV-20). Si se guardara como lo escribe cada uno, el
 * mismo cliente entraria dos veces: `70123456`, `+591 70123456` y
 * `591-7012-3456` son la misma persona.
 *
 * Funcion pura, y por eso vive aca: es una regla del negocio, no un detalle de
 * transporte.
 */

/** Bolivia. El unico pais del piloto, y el unico prefijo que se asume. */
export const PREFIJO_BOLIVIA = '+591';

/** Los moviles bolivianos son ocho digitos y empiezan en 6 o 7. */
const MOVIL_BOLIVIANO = /^[67]\d{7}$/;

/** Lo que la base acepta: cliente_telefono_e164_chk. */
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Devuelve el telefono en E.164, o null si no hay forma de entenderlo.
 *
 * Acepta lo que la gente escribe de verdad: con espacios, guiones, parentesis
 * o puntos; con `+591`, con `591` pelado, o los ocho digitos solos. Un numero
 * de otro pais pasa si ya viene con su `+`: no se le inventa prefijo a nadie.
 */
export function normalizarTelefono(tipeado: string): string | null {
  const limpio = tipeado.replace(/[\s()\-.]/g, '');
  if (limpio === '') return null;

  if (limpio.startsWith('+')) {
    return E164.test(limpio) ? limpio : null;
  }

  // Sin `+` solo se entienden numeros bolivianos: ocho digitos, con o sin el
  // 591 adelante. Los ceros de mas que alguien escribe para "marcar" sobran.
  const digitos = limpio.replace(/^0+/, '');
  if (!/^\d+$/.test(digitos)) return null;

  const sinPais = digitos.startsWith('591') ? digitos.slice(3) : digitos;
  if (!MOVIL_BOLIVIANO.test(sinPais)) return null;
  return `${PREFIJO_BOLIVIA}${sinPais}`;
}

/** Los ultimos cuatro digitos, que es lo unico que se muestra en caja. */
export function ultimosCuatro(telefono: string): string {
  return telefono.slice(-4);
}
