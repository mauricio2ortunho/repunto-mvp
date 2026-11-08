import type { ResumenDelDueno } from '@repunto/contratos';

import { motivoDelLocal } from './tablero';
import { haceCuanto } from './tablets-del-admin';

/**
 * Lo que el resumen del dueño decide mostrar, fuera del componente para
 * probarlo sin navegador. Los números los cuenta la api; acá solo se
 * escriben para que el dueño los lea sin explicaciones.
 */

/** "60 %" de los que tienen sellos. Null si todavía no hay ninguno. */
export function porcentaje(parte: number, total: number): string | null {
  if (total === 0) return null;
  return `${Math.round((parte / total) * 100)} %`;
}

/** Debajo de "Volvieron": sobre cuántos, dicho sin "de tus 1 clientes". */
export function pieDeVolvieron(c: ResumenDelDueno['clientes']): string {
  const parte = porcentaje(c.volvieron, c.con_sellos);
  if (parte === null) return 'Todavía nadie juntó sellos.';
  if (c.con_sellos === 1) return 'De tu único cliente con sellos';
  return `${parte} de tus ${c.con_sellos} clientes`;
}

/**
 * La mediana de días entre visitas, dicha como se dice: "cada 5 días".
 * Menos de un día es que vuelven en el mismo día, que con un intervalo de
 * horas entre sellos puede pasar.
 */
export function textoDeFrecuencia(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias < 1) return 'el mismo día';
  const redondeado = Math.round(dias);
  return redondeado === 1 ? 'cada día' : `cada ${redondeado} días`;
}

export interface LocalParaElDueno {
  id: string;
  nombre: string;
  /** "9 sellos en 7 días · último sello hace 2 h". */
  detalle: string;
  /** Solo si preocupa: sin tablet, nunca selló o una semana sin sellar. */
  alerta: string | null;
}

export function localesParaElDueno(r: ResumenDelDueno): LocalParaElDueno[] {
  const ahora = new Date(r.generado_el);
  const { semana_dias, local_sin_sellos_dias } = r.ventanas;
  return r.locales.map((l) => {
    const sellos = l.sellos_semana === 1 ? '1 sello' : `${l.sellos_semana} sellos`;
    const ultimo =
      l.ultimo_sello === null
        ? 'todavía no selló'
        : `último sello ${haceCuanto(l.ultimo_sello, ahora)}`;
    return {
      id: l.id,
      nombre: l.nombre,
      detalle: `${sellos} en ${semana_dias} días · ${ultimo}`,
      alerta: motivoDelLocal(l, ahora.getTime(), local_sin_sellos_dias),
    };
  });
}
