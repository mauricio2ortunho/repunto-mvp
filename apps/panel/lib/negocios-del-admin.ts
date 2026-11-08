import type {
  CondicionDelHistorial,
  NegocioDelAdmin,
  ProgramaVigente,
} from '@repunto/contratos';

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

/** La promo vigente, en frases cortas: para la ficha y para el dueño. */
export function describirPrograma(p: ProgramaVigente): string[] {
  const vence =
    p.vigencia_meses === null
      ? 'La tarjeta no vence'
      : p.vigencia_meses === 1
        ? 'Vence al mes del primer sello'
        : `Vence a los ${p.vigencia_meses} meses del primer sello`;
  const horas =
    p.horas_entre_sellos === 0
      ? 'Sin mínimo entre sellos'
      : p.horas_entre_sellos === 1
        ? '1 hora mínima entre sellos'
        : `${p.horas_entre_sellos} horas mínimas entre sellos`;
  return [vence, horas, ...(p.pide_monto ? ['Pide el monto de la compra'] : [])];
}

/**
 * Lo que el admin tiene que leer antes de guardar una promo nueva
 * (especificacion, seccion 8): va a suponer que cambio todo, y no.
 */
export function avisoDeTarjetasEnCurso(enCurso: number): string {
  const nuevas = 'La nueva vale para las tarjetas que se abran desde ahora.';
  if (enCurso === 0) return `No hay tarjetas en curso. ${nuevas}`;
  const cuantas =
    enCurso === 1 ? '1 tarjeta en curso sigue' : `${enCurso} tarjetas en curso siguen`;
  return `${cuantas} con la promo actual hasta completarse o vencer. ${nuevas}`;
}

export function autorDe(c: CondicionDelHistorial): string {
  return c.autor.tipo === 'administracion' ? 'Administración' : c.autor.nombre;
}
