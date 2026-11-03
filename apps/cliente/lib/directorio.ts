import {
  type NegocioDelDirectorio,
  RUBROS_DE_NEGOCIO,
  esRubroDeNegocio,
  tituloDeRubro,
} from '@repunto/contratos';

/**
 * Como se arma la pantalla "Dónde juntar sellos" a partir de `GET /negocios`.
 * El filtro y el orden los decide la api; aca solo se agrupa por rubro y se
 * marca donde el cliente ya tiene tarjeta.
 */

export interface NegocioEnElDirectorio {
  negocio: NegocioDelDirectorio;
  /** Si el cliente ya tiene una tarjeta ahi, de cualquier estado. */
  tieneTarjeta: boolean;
}

export interface RubroDelDirectorio {
  categoria: string;
  titulo: string;
  negocios: NegocioEnElDirectorio[];
}

/**
 * Agrupa por rubro, con los rubros en el orden de `RUBROS_DE_NEGOCIO` —asi
 * "Otros" queda al final— y los negocios de cada uno en el orden en que
 * llegan, que ya viene por nombre. Un rubro que la app no conoce cae en
 * "otro". `conTarjeta` son los ids de los negocios de las tarjetas del
 * cliente; sin sesion, vacio.
 */
export function agruparPorRubro(
  negocios: readonly NegocioDelDirectorio[],
  conTarjeta: ReadonlySet<string>,
): RubroDelDirectorio[] {
  const rubros: RubroDelDirectorio[] = [];
  for (const negocio of negocios) {
    const categoria = esRubroDeNegocio(negocio.categoria) ? negocio.categoria : 'otro';
    let rubro = rubros.find((r) => r.categoria === categoria);
    if (rubro === undefined) {
      rubro = { categoria, titulo: tituloDeRubro(categoria), negocios: [] };
      rubros.push(rubro);
    }
    rubro.negocios.push({ negocio, tieneTarjeta: conTarjeta.has(negocio.id) });
  }
  const posicion = (categoria: string) =>
    (RUBROS_DE_NEGOCIO as readonly string[]).indexOf(categoria);
  return rubros.sort((a, b) => posicion(a.categoria) - posicion(b.categoria));
}

/** "10 sellos → Un café gratis". */
export function promoDe(
  negocio: Pick<NegocioDelDirectorio, 'sellos_requeridos' | 'premio'>,
): string {
  const sellos =
    negocio.sellos_requeridos === 1 ? '1 sello' : `${negocio.sellos_requeridos} sellos`;
  return `${sellos} → ${negocio.premio}`;
}
