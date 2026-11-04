import type { NegocioDelAdmin } from '@repunto/contratos';

/**
 * Lo que le falta a un negocio para funcionar, dicho para el admin. Cada
 * aviso nombra la consecuencia, no la columna: "no aparece en Dónde juntar
 * sellos" es lo que hace que alguien vaya a cargar el local.
 *
 * Los criterios son los mismos que aplican la caja y el directorio: sin promo
 * o sin condicion la caja no sella; sin local abierto el negocio no se
 * ofrece y no hay donde sellar.
 */
export function avisosDelNegocio(n: NegocioDelAdmin): string[] {
  const avisos: string[] = [];
  if (n.programa === null) {
    avisos.push('Sin promo: la caja contesta "promo no configurada".');
  }
  if (n.condicion === null) {
    avisos.push('Sin condición del sello: la caja no puede sellar.');
  }
  if (n.locales_activos === 0) {
    avisos.push(
      'Sin locales abiertos: no aparece en "Dónde juntar sellos" y no tiene dónde sellar.',
    );
  }
  return avisos;
}

export function localesEnTexto(cantidad: number): string {
  if (cantidad === 0) return 'Sin locales';
  return cantidad === 1 ? '1 local' : `${cantidad} locales`;
}
