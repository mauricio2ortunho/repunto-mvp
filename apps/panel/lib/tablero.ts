import type { TableroDelPiloto } from '@repunto/contratos';

/**
 * Lo que el tablero del piloto decide mostrar, fuera del componente para
 * probarlo sin navegador: los totales de arriba y los locales que preocupan.
 */

const DIA = 86_400_000;

export interface Totales {
  sellos_semana: number;
  clientes_activos: number;
  clientes_nuevos_del_mes: number;
  canjes_mes: number;
}

/**
 * Sumados entre los negocios activos. Una persona con tarjeta en dos negocios
 * cuenta en los dos: es un cliente activo de cada uno.
 */
export function totales(t: TableroDelPiloto): Totales {
  const activos = t.negocios.filter((n) => n.estado === 'activo');
  const sumar = (campo: keyof Totales) =>
    activos.reduce((total, n) => total + n[campo], 0);
  return {
    sellos_semana: sumar('sellos_semana'),
    clientes_activos: sumar('clientes_activos'),
    clientes_nuevos_del_mes: sumar('clientes_nuevos_del_mes'),
    canjes_mes: sumar('canjes_mes'),
  };
}

export interface LocalQuePreocupa {
  negocio: string;
  negocio_id: string;
  local: string;
  /** Ya escrito: por qué preocupa. */
  motivo: string;
}

/**
 * Los locales abiertos de negocios activos donde el sistema no se está
 * usando: sin tablet (no pueden sellar), o sin sellos en la ventana. Los de
 * negocios suspendidos no preocupan: no sellan a propósito.
 */
export function localesQuePreocupan(t: TableroDelPiloto): LocalQuePreocupa[] {
  const ahora = Date.parse(t.generado_el);
  const ventana = t.ventanas.local_sin_sellos_dias;
  const lista: LocalQuePreocupa[] = [];
  for (const n of t.negocios) {
    if (n.estado !== 'activo') continue;
    for (const l of n.locales) {
      const motivo = motivoDe(l, ahora, ventana);
      if (motivo !== null) {
        lista.push({ negocio: n.nombre, negocio_id: n.id, local: l.nombre, motivo });
      }
    }
  }
  return lista;
}

function motivoDe(
  l: TableroDelPiloto['negocios'][number]['locales'][number],
  ahora: number,
  ventana: number,
): string | null {
  if (l.tablets_activas === 0) return 'No tiene tablet: no puede sellar.';
  if (l.ultimo_sello === null) return 'Nunca selló.';
  const dias = Math.floor((ahora - Date.parse(l.ultimo_sello)) / DIA);
  return dias >= ventana ? `Lleva ${dias} días sin sellar.` : null;
}
