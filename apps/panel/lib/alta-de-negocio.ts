import {
  COLORES_SUGERIDOS_DE_NEGOCIO,
  ICONO_DE_SELLO_POR_DEFECTO,
  LIMITES_DEL_NEGOCIO,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  esColorHex,
  esRubroDeNegocio,
  esquemaCondicionNueva,
  esquemaDatosDelNegocio,
  esquemaNegocioNuevo,
  esquemaProgramaNuevo,
  iconoDeSelloDe,
  plantillaDeTarjetaDe,
  type CondicionDelHistorial,
  type CondicionNueva,
  type DatosDelNegocio,
  type FichaDelNegocio,
  type IconoDeSello,
  type NegocioNuevo,
  type PlantillaDeTarjeta,
  type ProgramaNuevo,
  type ProgramaVigente,
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

/**
 * Cada parte del formulario se revisa sola, porque la ficha del negocio
 * guarda cada una por separado: la apariencia, la promo y la condicion.
 */
export type Revision<T> =
  { ok: true; peticion: T } | { ok: false; problemas: Partial<Record<Campo, string>> };

const L = LIMITES_DEL_NEGOCIO;

/** Si lo de arriba ya cubre el esquema y algun dia divergen, que no se mande. */
const NO_SE_PUEDE_MANDAR = 'Revisá los datos del formulario.';

/** Nombre, rubro, apariencia y donde se canjea. */
export function revisarDatos(b: Borrador): Revision<DatosDelNegocio> {
  const problemas: Partial<Record<Campo, string>> = {};

  const nombre = b.nombre.trim();
  if (nombre === '') problemas.nombre = 'Escribí el nombre del negocio.';
  else if (nombre.length > L.nombre) problemas.nombre = `Hasta ${L.nombre} letras.`;

  if (b.categoria === '') problemas.categoria = 'Elegí el rubro.';

  if (!esColorHex(b.color))
    problemas.color = 'Elegí un color de la lista o de la paleta.';

  if (Object.keys(problemas).length > 0) return { ok: false, problemas };
  const datos = esquemaDatosDelNegocio.safeParse({
    nombre,
    categoria: b.categoria,
    color_principal: b.color,
    icono_sello: b.icono,
    plantilla_tarjeta: b.plantilla,
    canje_cualquier_local: b.canjeCualquierLocal,
  });
  return datos.success
    ? { ok: true, peticion: datos.data }
    : { ok: false, problemas: { nombre: NO_SE_PUEDE_MANDAR } };
}

export function revisarPrograma(b: Borrador): Revision<ProgramaNuevo> {
  const problemas: Partial<Record<Campo, string>> = {};

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

  if (Object.keys(problemas).length > 0) return { ok: false, problemas };
  const programa = esquemaProgramaNuevo.safeParse({
    sellos_requeridos: sellos,
    premio,
    vigencia_meses: vigencia,
    horas_entre_sellos: horas,
    pide_monto: b.pideMonto,
  });
  return programa.success
    ? { ok: true, peticion: programa.data }
    : { ok: false, problemas: { sellos: NO_SE_PUEDE_MANDAR } };
}

export function revisarCondicion(b: Borrador): Revision<CondicionNueva> {
  const problemas: Partial<Record<Campo, string>> = {};

  const texto = b.condicion.trim();
  if (texto === '') problemas.condicion = 'Escribí qué compra suma un sello.';
  else if (texto.length > L.condicion) {
    problemas.condicion = `Hasta ${L.condicion} letras.`;
  }

  const monto = montoDesde(b.montoMinimo);
  if (monto === undefined) problemas.montoMinimo = 'Un monto como 15 o 15,50.';

  if (Object.keys(problemas).length > 0) return { ok: false, problemas };
  const condicion = esquemaCondicionNueva.safeParse({ texto, monto_minimo: monto });
  return condicion.success
    ? { ok: true, peticion: condicion.data }
    : { ok: false, problemas: { condicion: NO_SE_PUEDE_MANDAR } };
}

/** El alta: las tres partes juntas, con todos los problemas a la vez. */
export function revisar(b: Borrador): Revision<NegocioNuevo> {
  const datos = revisarDatos(b);
  const programa = revisarPrograma(b);
  const condicion = revisarCondicion(b);
  if (!datos.ok || !programa.ok || !condicion.ok) {
    return {
      ok: false,
      problemas: {
        ...(datos.ok ? {} : datos.problemas),
        ...(programa.ok ? {} : programa.problemas),
        ...(condicion.ok ? {} : condicion.problemas),
      },
    };
  }
  const alta = esquemaNegocioNuevo.safeParse({
    ...datos.peticion,
    programa: programa.peticion,
    condicion: condicion.peticion,
  });
  return alta.success
    ? { ok: true, peticion: alta.data }
    : { ok: false, problemas: { nombre: NO_SE_PUEDE_MANDAR } };
}

/**
 * El formulario lleno con lo que el negocio tiene hoy, para editarlo en la
 * ficha. Un valor de diseño que este panel no conoce cae en el de por
 * defecto, como al dibujarlo.
 */
export function borradorDesde(f: FichaDelNegocio): Borrador {
  return {
    ...borradorDeLaPromo(f),
    nombre: f.nombre,
    categoria: esRubroDeNegocio(f.categoria) ? f.categoria : 'otro',
    color: f.color_principal,
    icono: iconoDeSelloDe(f.icono_sello),
    plantilla: plantillaDeTarjetaDe(f.plantilla_tarjeta),
    canjeCualquierLocal: f.canje_cualquier_local,
  };
}

/**
 * Solo la promo y la condicion vigentes, para quien no cambia nada mas: el
 * dueño. El resto queda como en un alta y nadie lo manda.
 */
export function borradorDeLaPromo(p: {
  programa: ProgramaVigente | null;
  condiciones: readonly CondicionDelHistorial[];
}): Borrador {
  const condicion = p.condiciones[0];
  return {
    ...BORRADOR_INICIAL,
    sellos: String(p.programa?.sellos_requeridos ?? BORRADOR_INICIAL.sellos),
    premio: p.programa?.premio ?? '',
    vence: p.programa === null ? true : p.programa.vigencia_meses !== null,
    vigenciaMeses: String(p.programa?.vigencia_meses ?? BORRADOR_INICIAL.vigenciaMeses),
    horasEntreSellos: String(
      p.programa?.horas_entre_sellos ?? BORRADOR_INICIAL.horasEntreSellos,
    ),
    pideMonto: p.programa?.pide_monto ?? false,
    condicion: condicion?.texto ?? '',
    montoMinimo: condicion?.monto_minimo?.replace('.', ',') ?? '',
  };
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
