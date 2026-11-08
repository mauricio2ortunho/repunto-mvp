import {
  CODIGOS_DE_ERROR_DE_CAJA,
  type CodigoDeErrorDeCaja,
  type FichaDelNegocio,
  type TabletDelAdmin,
  mensajeParaElCajero,
} from '@repunto/contratos';

/**
 * Las tablets de cada local en la ficha del admin, con su salud. Lo que se
 * decide aca —que tablet preocupa y por que— vive fuera del componente para
 * poder probarlo sin navegador.
 */

/** La alerta de local sin sellos (CLAUDE.md, secciones 7 y 8). */
export const DIAS_SIN_SELLOS_PARA_ALERTA = 7;

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Las de un local: las activas, y aparte las revocadas, que solo se miran. */
export function tabletsDelLocal(
  ficha: Pick<FichaDelNegocio, 'tablets'>,
  localId: string,
): { activas: TabletDelAdmin[]; revocadas: TabletDelAdmin[] } {
  const delLocal = ficha.tablets.filter((t) => t.local_id === localId);
  return {
    activas: delLocal.filter((t) => t.revocada_el === null),
    revocadas: delLocal.filter((t) => t.revocada_el !== null),
  };
}

/** "hace un momento", "hace 5 min", "hace 3 h", "ayer", "hace 12 días". */
export function haceCuanto(iso: string, ahora: Date): string {
  const pasado = Math.max(0, ahora.getTime() - Date.parse(iso));
  if (pasado < MINUTO) return 'hace un momento';
  if (pasado < HORA) return `hace ${Math.floor(pasado / MINUTO)} min`;
  if (pasado < DIA) return `hace ${Math.floor(pasado / HORA)} h`;
  const dias = Math.floor(pasado / DIA);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

export interface SaludDeTablet {
  /** Siempre: cuándo selló por última vez. */
  texto: string;
  /** Solo si preocupa: lleva una semana sin sellar. */
  alerta: string | null;
}

/**
 * Una tablet que no sella es un local donde el sistema se abandonó. Si
 * además intentaron usarla, no es abandono: algo la rechaza, y el último
 * rechazo dice qué. Recién vinculada, todavía no preocupa.
 */
export function saludDeTablet(t: TabletDelAdmin, ahora: Date): SaludDeTablet {
  const texto =
    t.ultimo_sello === null
      ? 'Todavía no selló'
      : `Último sello ${haceCuanto(t.ultimo_sello, ahora)}`;

  const desde = t.ultimo_sello ?? t.vinculada_el;
  const dias = Math.floor((ahora.getTime() - Date.parse(desde)) / DIA);
  if (dias < DIAS_SIN_SELLOS_PARA_ALERTA) return { texto, alerta: null };

  const sinSellar =
    t.ultimo_sello === null
      ? `Vinculada hace ${dias} días y nunca selló`
      : `Lleva ${dias} días sin sellar`;
  const rechazo = t.ultimo_rechazo === null ? null : textoDelRechazo(t.ultimo_rechazo);
  return {
    texto,
    alerta:
      rechazo === null
        ? `${sinSellar}: puede que no la estén usando.`
        : `${sinSellar}. Lo último que le rechazó la caja: "${rechazo}"`,
  };
}

/** El mensaje que vio el cajero, si el código es uno que conocemos. */
function textoDelRechazo(codigo: string): string | null {
  return esCodigoDeCaja(codigo) ? mensajeParaElCajero(codigo) : null;
}

function esCodigoDeCaja(codigo: string): codigo is CodigoDeErrorDeCaja {
  return (CODIGOS_DE_ERROR_DE_CAJA as readonly string[]).includes(codigo);
}

/** Lo que se lee al lado de una revocada. */
export function textoDeRevocada(
  t: TabletDelAdmin,
  fecha: (iso: string) => string,
): string {
  return t.revocada_el === null
    ? t.nombre
    : `${t.nombre}, revocada el ${fecha(t.revocada_el)}`;
}
