'use client';

import { useEffect, useRef, useState } from 'react';

import type { Esquema, Fallo, Respuesta } from '../../lib/api/http';
import { ultimoDelTelefono } from '../../lib/ultimo';

/**
 * Una consulta que se ve sin conexion: arranca mostrando lo ultimo que se vio,
 * lo actualiza en cuanto contesta la api, y si no hay conexion se queda con lo
 * guardado y lo dice (`guardado: true`). Vuelve a pedir al volver a la app.
 */
export type Consulta<T> =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; datos: T; guardado: boolean }
  | { tipo: 'error'; fallo: Fallo };

export function useConsulta<T>(
  clave: string,
  esquema: Esquema<T>,
  pedir: (senal: AbortSignal) => Promise<Respuesta<T>>,
): Consulta<T> {
  const [consulta, setConsulta] = useState<Consulta<T>>({ tipo: 'cargando' });
  // La ultima funcion, sin que cambiarla reinicie la consulta.
  const pedirActual = useRef(pedir);
  pedirActual.current = pedir;

  useEffect(() => {
    const ultimo = ultimoDelTelefono();
    const guardado = ultimo.leer(clave, esquema);
    setConsulta(
      guardado === null
        ? { tipo: 'cargando' }
        : { tipo: 'listo', datos: guardado, guardado: true },
    );

    let control = new AbortController();
    let enCurso = false;

    async function consultar() {
      if (enCurso) return;
      enCurso = true;
      const respuesta = await pedirActual.current(control.signal);
      enCurso = false;
      if (control.signal.aborted) return;

      if (respuesta.ok) {
        ultimo.guardar(clave, respuesta.datos);
        setConsulta({ tipo: 'listo', datos: respuesta.datos, guardado: false });
        return;
      }
      // Sin conexion, lo guardado sigue sirviendo. Un rechazo, no: la api dijo
      // que no, y mostrar lo viejo seria mentir.
      setConsulta((antes) =>
        respuesta.tipo === 'incierto' && antes.tipo === 'listo'
          ? { ...antes, guardado: true }
          : { tipo: 'error', fallo: respuesta },
      );
    }

    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      control = new AbortController();
      void consultar();
    };

    void consultar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      control.abort();
      document.removeEventListener('visibilitychange', alVolver);
    };
    // Solo `clave`: el esquema es una constante de contratos y la funcion se
    // lee de la referencia.
  }, [clave]);

  return consulta;
}
