import {
  COLORES_SUGERIDOS_DE_NEGOCIO,
  ICONO_DE_SELLO_POR_DEFECTO,
  LIMITES_DEL_NEGOCIO,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  esColorHex,
  esquemaNegocioNuevo,
  type IconoDeSello,
  type NegocioNuevo,
  type PlantillaDeTarjeta,
  type RubroDeNegocio,
} from '@repunto/contratos';

/**
 * El formulario del alta de un negocio, sin React: lo que el admin va
 * escribiendo, lo que trae de entrada y como se convierte en el pedido.
 *
 * Los numeros viajan como texto mientras se escriben —un campo vacio no es
 * cero— y se convierten recien al revisar. Quien decide si el alta sirve es
 * la api con el mismo esquema; esto solo le dice al admin que corregir antes
 * de mandar.
 */
export interface Borrador {
  nombre: string;
  /** Vacio hasta que se elija: no se le asigna un rubro a nadie por defecto. */
  categoria: RubroDeNegocio | '';
  color: string;
  icono: IconoDeSello;
  plantilla: PlantillaDeTarjeta;
  canjeCualquierLocal: boolean;
  sellos: string;
  premio: string;
  vence: boolean;
  vigenciaMeses: string;
  horasEntreSellos: string;
  pideMonto: boolean;
  condicion: string;
  /** En bolivianos, con coma o con punto. Vacio: sin monto minimo. */
  montoMinimo: string;
}

export type Campo = keyof Borrador;

/**
 * Lo que trae el formulario al abrirse. Los valores de la promo son los
 * acordados para el piloto: 10 sellos, la tarjeta vence al mes, 4 horas
 * entre sellos, canje en cualquier sucursal y sin pedir monto.
 */
export const BORRADOR_INICIAL: Readonly<Borrador> = {
  nombre: '',
  categoria: '',
  color: COLORES_SUGERIDOS_DE_NEGOCIO[0],
  icono: ICONO_DE_SELLO_POR_DEFECTO,
  plantilla: PLANTILLA_DE_TARJETA_POR_DEFECTO,
  canjeCualquierLocal: true,
  sellos: '10',
  premio: '',
  vence: true,
  vigenciaMeses: '1',
  horasEntreSellos: '4',
  pideMonto: false,
  condicion: '',
  montoMinimo: '',
};

export type Revision =
  | { ok: true; peticion: NegocioNuevo }
  | { ok: false; problemas: Partial<Record<Campo, string>> };

const L = LIMITES_DEL_NEGOCIO;

/** Que corregir, campo por campo, o el pedido listo para mandar. */
export function revisar(b: Borrador): Revision {
  const problemas: Partial<Record<Campo, string>> = {};

  const nombre = b.nombre.trim();
  if (nombre === '') problemas.nombre = 'Escribí el nombre del negocio.';
  else if (nombre.length > L.nombre) problemas.nombre = `Hasta ${L.nombre} letras.`;

  const categoria = b.categoria;
  if (categoria === '') problemas.categoria = 'Elegí el rubro.';

  if (!esColorHex(b.color))
    problemas.color = 'Elegí un color de la lista o de la paleta.';

  const sellos = entero(b.sellos);
  const { minimo: minS, maximo: maxS } = L.sellosRequeridos;
  if (sellos === null || sellos < minS || sellos > maxS) {
    problemas.sellos = `Entre ${minS} y ${maxS} sellos.`;
  }

  const premio = b.premio.trim();
  if (premio === '') problemas.premio = 'Escribí el premio.';
  else if (premio.length > L.premio) problemas.premio = `Hasta ${L.premio} letras.`;

  let vigencia: number | null = null;
  if (b.vence) {
    vigencia = entero(b.vigenciaMeses);
    const { minimo, maximo } = L.vigenciaMeses;
    if (vigencia === null || vigencia < minimo || vigencia > maximo) {
      problemas.vigenciaMeses = `Entre ${minimo} y ${maximo} meses.`;
    }
  }

  const horas = entero(b.horasEntreSellos);
  const { minimo: minH, maximo: maxH } = L.horasEntreSellos;
  if (horas === null || horas < minH || horas > maxH) {
    problemas.horasEntreSellos = `Entre ${minH} y ${maxH} horas.`;
  }

  const condicion = b.condicion.trim();
  if (condicion === '') problemas.condicion = 'Escribí qué compra suma un sello.';
  else if (condicion.length > L.condicion) {
    problemas.condicion = `Hasta ${L.condicion} letras.`;
  }

  const monto = montoDesde(b.montoMinimo);
  if (monto === undefined) problemas.montoMinimo = 'Un monto como 15 o 15,50.';

  if (Object.keys(problemas).length > 0 || categoria === '' || monto === undefined) {
    return { ok: false, problemas };
  }

  const peticion = esquemaNegocioNuevo.safeParse({
    nombre,
    categoria,
    color_principal: b.color,
    icono_sello: b.icono,
    plantilla_tarjeta: b.plantilla,
    canje_cualquier_local: b.canjeCualquierLocal,
    programa: {
      sellos_requeridos: sellos,
      premio,
      vigencia_meses: vigencia,
      horas_entre_sellos: horas,
      pide_monto: b.pideMonto,
    },
    condicion: { texto: condicion, monto_minimo: monto },
  });
  // Lo de arriba ya cubre el esquema; si algun dia divergen, que no se mande.
  if (!peticion.success) {
    return { ok: false, problemas: { nombre: 'Revisá los datos del formulario.' } };
  }
  return { ok: true, peticion: peticion.data };
}

function entero(texto: string): number | null {
  const t = texto.trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}

/** null: sin monto. undefined: no se entiende. */
function montoDesde(texto: string): string | null | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return null;
  return /^\d{1,10}(\.\d{1,2})?$/.test(t) ? t : undefined;
}

/** "10 sellos → Un café gratis", como en la app del cliente. */
export function promoEnTexto(sellos: number, premio: string): string {
  return `${sellos} ${sellos === 1 ? 'sello' : 'sellos'} → ${premio}`;
}

/** Como se nombra cada icono en el formulario. Uno nuevo en contratos no compila sin su nombre. */
export const TITULOS_DE_ICONO: Readonly<Record<IconoDeSello, string>> = {
  cafe: 'Café',
  estrella: 'Estrella',
  corazon: 'Corazón',
  huella: 'Huella',
};

export const TITULOS_DE_PLANTILLA: Readonly<Record<PlantillaDeTarjeta, string>> = {
  clasica: 'Clásica',
  moderna: 'Moderna',
  minima: 'Mínima',
};
