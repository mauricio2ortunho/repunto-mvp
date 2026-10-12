/**
 * El vocabulario de diseño: los valores que describen como se ve un negocio y
 * la regla de contraste que decide el color del texto encima.
 *
 * Vive aca, y no en cada app, porque el panel y la PWA tienen que elegir
 * exactamente igual. `contratos` es lo unico que las dos pueden importar
 * (CLAUDE.md, seccion 3), y ya lleva una funcion de presentacion con el mismo
 * problema: `mensajeParaElCajero`.
 *
 * Duplicarlo seria peor que duplicar la lista de codigos de error. Esa esta
 * repetida a proposito y tiene un test que falla si las copias divergen; dos
 * funciones de contraste con distinto umbral no fallan nunca: eligen distinto
 * en un puñado de colores y nadie se entera.
 */

// ---------------------------------------------------------------------------
// Valores de diseño del negocio
// ---------------------------------------------------------------------------

/**
 * Como se dibuja un sello otorgado. PROVISIONAL: salen del trabajo de diseño.
 *
 * La base los restringe con `negocio_icono_sello_chk`, y un test de
 * integracion compara esta lista contra ese CHECK: agregar uno es una linea de
 * migracion, una en `docs/garantias-de-la-base.md` y una aca, y el test avisa
 * si falta alguna.
 */
export const ICONOS_DE_SELLO = ['cafe', 'estrella', 'corazon', 'huella'] as const;

export type IconoDeSello = (typeof ICONOS_DE_SELLO)[number];

/** Con el que se dibuja un valor que esta app todavia no conoce. */
export const ICONO_DE_SELLO_POR_DEFECTO: IconoDeSello = 'estrella';

/** La traza de la tarjeta del cliente. PROVISIONAL, mismo criterio. */
export const PLANTILLAS_DE_TARJETA = ['clasica', 'moderna', 'minima'] as const;

export type PlantillaDeTarjeta = (typeof PLANTILLAS_DE_TARJETA)[number];

export const PLANTILLA_DE_TARJETA_POR_DEFECTO: PlantillaDeTarjeta = 'clasica';

/**
 * Las dos vienen de la API como texto suelto, no como enum, y es a proposito:
 * si mañana se agrega un icono en la base y una app todavia no lo conoce,
 * tiene que dibujar el de por defecto, no romperse. Con un enum en el esquema
 * de la respuesta, `/caja/estado` tiraria 500 en el mostrador por un dato de
 * diseño.
 */
export function esIconoDeSello(valor: string): valor is IconoDeSello {
  return (ICONOS_DE_SELLO as readonly string[]).includes(valor);
}

export function esPlantillaDeTarjeta(valor: string): valor is PlantillaDeTarjeta {
  return (PLANTILLAS_DE_TARJETA as readonly string[]).includes(valor);
}

/** El icono que corresponde dibujar, conocido o no. */
export function iconoDeSelloDe(valor: string): IconoDeSello {
  return esIconoDeSello(valor) ? valor : ICONO_DE_SELLO_POR_DEFECTO;
}

export function plantillaDeTarjetaDe(valor: string): PlantillaDeTarjeta {
  return esPlantillaDeTarjeta(valor) ? valor : PLANTILLA_DE_TARJETA_POR_DEFECTO;
}

// ---------------------------------------------------------------------------
// Contraste
// ---------------------------------------------------------------------------

/** `#RRGGBB`, lo mismo que exige `negocio_color_principal_hex_chk`. */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** El minimo de WCAG AA para texto normal. */
export const CONTRASTE_MINIMO = 4.5;

export const TEXTO_SOBRE_OSCURO = '#FFFFFF';

/**
 * Negro puro, y no un casi-negro, no es preferencia de estilo: es lo que hace
 * que la regla valga para CUALQUIER color de marca. Con blanco y negro puros,
 * el peor fondo posible todavia llega a 4.58. Con un casi-negro tipo #1A1A1A
 * aparece una franja de grises medios donde ninguno de los dos llega a 4.5 y
 * la garantia se cae en silencio. Si alguien lo cambia, el test de la gama
 * entera falla.
 */
export const TEXTO_SOBRE_CLARO = '#000000';

export type ColorDeTexto = typeof TEXTO_SOBRE_OSCURO | typeof TEXTO_SOBRE_CLARO;

export function esColorHex(valor: string): boolean {
  return HEX.test(valor);
}

/** Luminancia relativa de WCAG 2.1. */
function luminancia(hex: string): number {
  const canales = [1, 3, 5].map(
    (desde) => parseInt(hex.slice(desde, desde + 2), 16) / 255,
  );
  const [r, g, b] = canales.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Relacion de contraste entre dos colores, de 1 a 21. Simetrica.
 * Devuelve 0 si alguno no es un hex de seis digitos.
 */
export function contrasteEntre(uno: string, otro: string): number {
  if (!esColorHex(uno) || !esColorHex(otro)) return 0;
  const a = luminancia(uno);
  const b = luminancia(otro);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * El color del texto que va encima de ese fondo: blanco o negro, el que
 * contraste mas. Nunca se elige a mano (CLAUDE.md, seccion 9); es lo que
 * permite cambiar el color de un negocio sin revisar si quedo legible.
 *
 * Un color que no es hex devuelve el oscuro: la app no deberia estar pintando
 * ese fondo —`esColorHex` se lo dice— y sobre su propio fondo claro el oscuro
 * es la respuesta segura.
 */
export function colorDeTextoSobre(fondo: string): ColorDeTexto {
  if (!esColorHex(fondo)) return TEXTO_SOBRE_CLARO;
  return contrasteEntre(fondo, TEXTO_SOBRE_OSCURO) >=
    contrasteEntre(fondo, TEXTO_SOBRE_CLARO)
    ? TEXTO_SOBRE_OSCURO
    : TEXTO_SOBRE_CLARO;
}
