/**
 * Todo instante se guarda en UTC; todo corte de dia, semana o mes se calcula en
 * La Paz (INV-21). Bolivia es UTC-4 fijo y sin horario de verano, asi que el
 * corte es aritmetica y no hace falta una libreria de zonas horarias.
 *
 * Ninguna funcion de este archivo lee el reloj del sistema: el instante entra
 * por parametro. Es lo que hace testeables el vencimiento y la ventana del
 * codigo.
 */

export const ZONA_HORARIA = 'America/La_Paz';

/** UTC-4, sin horario de verano. */
export const DESFASE_LA_PAZ_MINUTOS = -240;

const MS_POR_MINUTO = 60_000;
const DESFASE_MS = DESFASE_LA_PAZ_MINUTOS * MS_POR_MINUTO;

/** Dia del calendario en La Paz al que pertenece un instante. */
export interface DiaEnLaPaz {
  anio: number;
  /** 1 a 12, no 0 a 11: este tipo se lee, no se pasa a Date. */
  mes: number;
  dia: number;
}

export function diaEnLaPaz(instante: Date): DiaEnLaPaz {
  const local = new Date(instante.getTime() + DESFASE_MS);
  return {
    anio: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
  };
}

/** El instante exacto en que termina ese dia en La Paz: 23:59:59.999. */
export function finDelDia(dia: DiaEnLaPaz): Date {
  const local = Date.UTC(dia.anio, dia.mes - 1, dia.dia, 23, 59, 59, 999);
  return new Date(local - DESFASE_MS);
}

/** Fin del dia, en La Paz, del dia al que pertenece `instante`. */
export function finDelDiaEnLaPaz(instante: Date): Date {
  return finDelDia(diaEnLaPaz(instante));
}

/**
 * Mes calendario, no 30 dias (INV-13). Si el dia no existe en el mes destino,
 * cae en el ultimo: 31 de enero mas un mes es 28 de febrero, o 29 si el año es
 * bisiesto.
 */
export function sumarMesesCalendario(dia: DiaEnLaPaz, meses: number): DiaEnLaPaz {
  const total = dia.anio * 12 + (dia.mes - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return { anio, mes, dia: Math.min(dia.dia, diasDelMes(anio, mes)) };
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}
