import type { NegocioDelDirectorio } from '@repunto/contratos';

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
 * PROVISIONAL: `negocio.categoria` es texto libre hasta que el panel de
 * administracion fije la lista. Un rubro que no esta aca se muestra con su
 * propio nombre, en mayuscula, en lugar de romperse.
 */
const TITULOS: Readonly<Record<string, string>> = {
  cafe: 'Cafeterías',
  panaderia: 'Panaderías',
  heladeria: 'Heladerías',
  restaurante: 'Restaurantes',
  peluqueria: 'Peluquerías',
  barberia: 'Barberías',
};

export function tituloDeRubro(categoria: string): string {
  const conocido = TITULOS[categoria];
  if (conocido !== undefined) return conocido;
  return categoria.charAt(0).toLocaleUpperCase('es') + categoria.slice(1);
}

/**
 * Agrupa respetando el orden en que llegan, que ya viene por categoria y
 * nombre. `conTarjeta` son los ids de los negocios de las tarjetas del
 * cliente; sin sesion, vacio.
 */
export function agruparPorRubro(
  negocios: readonly NegocioDelDirectorio[],
  conTarjeta: ReadonlySet<string>,
): RubroDelDirectorio[] {
  const rubros: RubroDelDirectorio[] = [];
  for (const negocio of negocios) {
    let rubro = rubros.find((r) => r.categoria === negocio.categoria);
    if (rubro === undefined) {
      rubro = {
        categoria: negocio.categoria,
        titulo: tituloDeRubro(negocio.categoria),
        negocios: [],
      };
      rubros.push(rubro);
    }
    rubro.negocios.push({ negocio, tieneTarjeta: conTarjeta.has(negocio.id) });
  }
  return rubros;
}

/** "10 sellos → Un café gratis". */
export function promoDe(
  negocio: Pick<NegocioDelDirectorio, 'sellos_requeridos' | 'premio'>,
): string {
  const sellos =
    negocio.sellos_requeridos === 1 ? '1 sello' : `${negocio.sellos_requeridos} sellos`;
  return `${sellos} → ${negocio.premio}`;
}
