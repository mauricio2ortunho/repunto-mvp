import type {
  AnularRespuesta,
  CanjearRespuesta,
  ConfirmarRespuesta,
  SellarRespuesta,
} from '@repunto/contratos';
import type { CodigoDeError } from '../../lib/api/http';
import type { Accion } from '../../lib/api/mensajes';

/**
 * La caja como maquina de estados, sin React adentro para poder probarla.
 *
 * Dos modos. `sellar` es la caja de todos los dias. `canjear` aparece cuando
 * la tarjeta se completa -o cuando la API avisa que ya estaba completa- y
 * ocupa la vista entera hasta que se entrega el premio o el cajero vuelve sin
 * entregarlo. En ese modo no se confirman registros: hay un solo cliente
 * delante y una sola cosa que hacer.
 */

/**
 * Lo que muestra el area grande debajo del campo. `n` distingue un resultado
 * de otro igual: la vista lo usa de key para que el sello nuevo se estampe
 * cada vez, y solo cuando hay un resultado nuevo.
 */
export type Ultimo =
  | { tipo: 'nada' }
  | { tipo: 'sello'; n: number; datos: SellarRespuesta }
  | { tipo: 'alta'; n: number; datos: ConfirmarRespuesta }
  | { tipo: 'canje'; n: number; datos: CanjearRespuesta }
  | { tipo: 'anulado'; n: number; datos: AnularRespuesta }
  | { tipo: 'aviso'; n: number; mensaje: string };

/** La tarjeta que se acaba de completar, para mostrarla llena. */
export interface TarjetaCompleta {
  nombre: string;
  progreso: number;
  faltan: number;
  premio: string;
  /** El sello que la completo, para poder deshacerlo si fue un error. */
  sello_id: string | null;
}

interface Comun {
  /** Lo que hay escrito en el campo de codigo. */
  codigo: string;
  /** La accion en curso. Mientras haya una, no sale otra. */
  ocupado: Accion | null;
  /**
   * Cuenta las acciones terminadas. Cada vez que cambia, el foco vuelve al
   * campo: el cajero nunca tiene que tocarlo para tipear el proximo codigo.
   */
  vuelta: number;
  /** Tras un rechazo, el codigo queda seleccionado: lo que se tipee lo reemplaza. */
  seleccionar: boolean;
}

export type Estado =
  | (Comun & { modo: 'sellar'; ultimo: Ultimo })
  | (Comun & {
      modo: 'canjear';
      /** null si se llego por TARJETA_COMPLETA: el rechazo no trae la tarjeta. */
      tarjeta: TarjetaCompleta | null;
      /** El mensaje de la API que trajo hasta aca, si fue un rechazo. */
      contexto: string | null;
      aviso: string | null;
    });

export type Evento =
  | { tipo: 'escribio'; codigo: string }
  | { tipo: 'empezo'; accion: Accion }
  | { tipo: 'sellado'; datos: SellarRespuesta }
  | { tipo: 'confirmado'; datos: ConfirmarRespuesta }
  | { tipo: 'descartado' }
  | { tipo: 'canjeado'; datos: CanjearRespuesta }
  | { tipo: 'anulado'; datos: AnularRespuesta }
  | { tipo: 'fallo'; codigo: CodigoDeError | null; mensaje: string }
  /** El cajero sale del canje sin entregar: el cliente lo retira otro dia. */
  | { tipo: 'volvio' };

export const estadoInicial: Estado = {
  modo: 'sellar',
  codigo: '',
  ocupado: null,
  vuelta: 0,
  seleccionar: false,
  ultimo: { tipo: 'nada' },
};

function aSellar(e: Estado, ultimo: Ultimo, codigo: string): Estado {
  return { modo: 'sellar', codigo, ocupado: null, vuelta: e.vuelta + 1, seleccionar: false, ultimo };
}

function aCanjear(
  e: Estado,
  tarjeta: TarjetaCompleta | null,
  contexto: string | null,
): Estado {
  // El codigo con que se sello ya se consumio: el campo arranca vacio.
  return {
    modo: 'canjear',
    codigo: '',
    ocupado: null,
    vuelta: e.vuelta + 1,
    seleccionar: false,
    tarjeta,
    contexto,
    aviso: null,
  };
}

export function reducir(e: Estado, ev: Evento): Estado {
  switch (ev.tipo) {
    case 'escribio':
      return { ...e, codigo: ev.codigo, seleccionar: false };

    case 'empezo':
      if (e.modo === 'canjear') return { ...e, ocupado: ev.accion, aviso: null };
      // El resultado anterior es de otro cliente. Si se queda en pantalla
      // mientras esto viaja, el cajero lo lee como si fuera de este.
      // Descartar y deshacer son la excepcion: descartar no tiene resultado
      // propio, y deshacer es sobre el mismo cliente que esta en pantalla.
      return {
        ...e,
        ocupado: ev.accion,
        ultimo: ev.accion === 'descartar' || ev.accion === 'anular' ? e.ultimo : { tipo: 'nada' },
      };

    case 'sellado':
      return ev.datos.completa
        ? aCanjear(e, ev.datos, null)
        : aSellar(e, { tipo: 'sello', n: e.vuelta + 1, datos: ev.datos }, '');

    case 'confirmado':
      // El campo no se toca: el cajero pudo haber estado tipeando otro codigo.
      return ev.datos.completa
        ? aCanjear(e, ev.datos, null)
        : aSellar(e, { tipo: 'alta', n: e.vuelta + 1, datos: ev.datos }, e.codigo);

    case 'descartado':
      return { ...e, ocupado: null, vuelta: e.vuelta + 1 };

    case 'canjeado':
      return aSellar(e, { tipo: 'canje', n: e.vuelta + 1, datos: ev.datos }, '');

    case 'anulado':
      // Desde el canje tambien: el sello que completo la tarjeta fue un error,
      // asi que ya no hay premio que entregar.
      return aSellar(
        e,
        { tipo: 'anulado', n: e.vuelta + 1, datos: ev.datos },
        e.modo === 'sellar' ? e.codigo : '',
      );

    case 'fallo':
      if (e.modo === 'canjear') {
        return { ...e, ocupado: null, vuelta: e.vuelta + 1, seleccionar: true, aviso: ev.mensaje };
      }
      if (ev.codigo === 'TARJETA_COMPLETA') return aCanjear(e, null, ev.mensaje);
      return {
        ...e,
        ocupado: null,
        vuelta: e.vuelta + 1,
        seleccionar: true,
        ultimo: { tipo: 'aviso', n: e.vuelta + 1, mensaje: ev.mensaje },
      };

    case 'volvio':
      return aSellar(e, { tipo: 'nada' }, '');
  }
}
