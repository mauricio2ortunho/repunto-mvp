import type { EstadoDeTarjetaDelCliente } from '@repunto/contratos';

import { diaEnLaPaz, diasHasta } from './fechas';

/**
 * Los textos de una tarjeta segun su estado. El estado lo decide la api; aca
 * solo se elige como decirlo.
 */

interface ParaTitulo {
  estado: EstadoDeTarjetaDelCliente;
  faltan: number;
}

/** Lo primero que se lee de una tarjeta. */
export function tituloDeEstado(tarjeta: ParaTitulo): string {
  switch (tarjeta.estado) {
    case 'completa':
      return '¡Tarjeta completa!';
    case 'en_curso':
      return tarjeta.faltan === 1
        ? 'Te falta 1 sello'
        : `Te faltan ${tarjeta.faltan} sellos`;
    case 'congelada':
      return 'Tarjeta congelada';
    case 'vencida':
      return 'Tarjeta vencida';
    case 'canjeada':
      return 'Premio entregado';
  }
}

/** La explicacion, en el detalle: que significa y que hacer. */
export function explicacionDeEstado(estado: EstadoDeTarjetaDelCliente): string {
  switch (estado) {
    case 'completa':
      return 'Mostrá tu código en caja y pedí tu premio.';
    case 'en_curso':
      return 'Cada compra que cumpla la condición suma un sello.';
    case 'congelada':
      return 'El local está suspendido por ahora: no se puede sellar ni entregar premios.';
    case 'vencida':
      return 'Pasó la fecha de vencimiento. Con tu próxima compra empezás una tarjeta nueva.';
    case 'canjeada':
      return 'Ya te entregaron el premio de esta tarjeta.';
  }
}

/**
 * Cuando vence, contado en dias de La Paz. Nulo si no vence —sin sellos no
 * corre el reloj (INV-12)— o si ya no importa.
 */
export function vencimientoDe(
  tarjeta: { estado: EstadoDeTarjetaDelCliente; vence_el: string | null },
  ahora: number,
): string | null {
  if (tarjeta.vence_el === null) return null;
  if (tarjeta.estado !== 'en_curso' && tarjeta.estado !== 'completa') return null;
  const dias = diasHasta(tarjeta.vence_el, ahora);
  if (dias < 0) return `Venció el ${diaEnLaPaz(tarjeta.vence_el)}`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence el ${diaEnLaPaz(tarjeta.vence_el)} · quedan ${dias} días`;
}
