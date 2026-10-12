'use client';

import { useCallback, useReducer, useRef, useState } from 'react';
import { esquemaSellarPeticion, type RegistroEnCaja } from '@repunto/contratos';
import * as api from '../../lib/api/caja';
import type { Respuesta } from '../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../lib/api/idempotencia';
import { mensajeIncierto, type Accion } from '../../lib/api/mensajes';
import { estadoInicial, reducir } from './estado';

const SIN_CODIGO = 'Escribí el código que el cliente tiene en la app.';

/**
 * Las acciones de la caja. Cada una sale con su clave de idempotencia, de a
 * una por vez, y deja su resultado en el estado.
 *
 * `alRechazo` avisa cada vez que la API dice que no: un TURNO_CERRADO en medio
 * de un sello significa que lo que se sabia de la caja ya no vale.
 */
export function useCaja({ alRechazo }: { alRechazo?: () => void } = {}) {
  const [estado, despachar] = useReducer(reducir, estadoInicial);
  const [idempotencia] = useState(() => crearGestorDeIdempotencia());
  // El boton se deshabilita, pero dos toques en el mismo cuadro llegan antes
  // de que React lo pinte deshabilitado. Esto los corta en seco.
  const enVuelo = useRef(false);

  const correr = useCallback(
    async <T>(
      accion: Accion,
      firma: string,
      llamar: (clave: string) => Promise<Respuesta<T>>,
    ): Promise<Respuesta<T> | null> => {
      if (enVuelo.current) return null;
      enVuelo.current = true;
      despachar({ tipo: 'empezo', accion });
      try {
        const r = await llamar(idempotencia.clavePara(firma));
        // Solo lo incierto conserva la clave para el reintento.
        if (r.ok || r.tipo === 'rechazo') idempotencia.olvidar(firma);
        if (!r.ok && r.tipo === 'rechazo') alRechazo?.();
        if (!r.ok) {
          despachar({
            tipo: 'fallo',
            codigo: r.tipo === 'rechazo' ? r.codigo : null,
            mensaje: r.tipo === 'rechazo' ? r.mensaje : mensajeIncierto(r.causa, accion),
          });
        }
        return r;
      } finally {
        enVuelo.current = false;
      }
    },
    [idempotencia, alRechazo],
  );

  const escribir = useCallback((codigo: string) => despachar({ tipo: 'escribio', codigo }), []);

  /** Valida con el contrato antes de gastar una peticion en un campo vacio. */
  const leerCodigo = useCallback((codigo: string): string | null => {
    const p = esquemaSellarPeticion.safeParse({ codigo: codigo.trim() });
    if (p.success) return p.data.codigo;
    despachar({ tipo: 'fallo', codigo: null, mensaje: SIN_CODIGO });
    return null;
  }, []);

  const sellar = useCallback(
    async (escrito: string) => {
      if (enVuelo.current) return;
      const codigo = leerCodigo(escrito);
      if (codigo === null) return;
      const r = await correr('sellar', `sellar:${codigo}`, (clave) => api.sellar({ codigo }, clave));
      if (r?.ok === true) despachar({ tipo: 'sellado', datos: r.datos });
    },
    [correr, leerCodigo],
  );

  const canjear = useCallback(
    async (escrito: string) => {
      if (enVuelo.current) return;
      const codigo = leerCodigo(escrito);
      if (codigo === null) return;
      const r = await correr('canjear', `canjear:${codigo}`, (clave) =>
        api.canjear({ codigo }, clave),
      );
      if (r?.ok === true) despachar({ tipo: 'canjeado', datos: r.datos });
    },
    [correr, leerCodigo],
  );

  /**
   * Devuelve true si el registro ya no esta pendiente, para sacarlo de la
   * lista sin esperar la proxima consulta.
   */
  const confirmar = useCallback(
    async (registro: RegistroEnCaja, conSello: boolean): Promise<boolean> => {
      const r = await correr('confirmar', `confirmar:${registro.id}:${conSello}`, (clave) =>
        api.confirmarRegistro(registro.id, { sellar: conSello }, clave),
      );
      if (r === null) return false;
      if (r.ok) {
        despachar({ tipo: 'confirmado', datos: r.datos });
        return true;
      }
      return yaNoEstaPendiente(r);
    },
    [correr],
  );

  const descartar = useCallback(
    async (registro: RegistroEnCaja): Promise<boolean> => {
      const r = await correr('descartar', `descartar:${registro.id}`, (clave) =>
        api.descartarRegistro(registro.id, clave),
      );
      if (r === null) return false;
      if (r.ok) {
        despachar({ tipo: 'descartado' });
        return true;
      }
      return yaNoEstaPendiente(r);
    },
    [correr],
  );

  /** Deshace un sello por su id. La API decide si todavia se puede. */
  const deshacer = useCallback(
    async (selloId: string) => {
      const r = await correr('anular', `anular:${selloId}`, (clave) =>
        api.anularSello(selloId, clave),
      );
      if (r?.ok === true) despachar({ tipo: 'anulado', datos: r.datos });
    },
    [correr],
  );

  const volver = useCallback(() => {
    if (!enVuelo.current) despachar({ tipo: 'volvio' });
  }, []);

  return { estado, escribir, sellar, canjear, confirmar, descartar, deshacer, volver };
}

function yaNoEstaPendiente(r: Respuesta<unknown>): boolean {
  return (
    !r.ok &&
    r.tipo === 'rechazo' &&
    (r.codigo === 'REGISTRO_YA_RESUELTO' || r.codigo === 'REGISTRO_NO_ENCONTRADO')
  );
}
