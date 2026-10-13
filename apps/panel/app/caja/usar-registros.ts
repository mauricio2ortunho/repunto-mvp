'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RegistroEnCaja } from '@repunto/contratos';
import { registrosPendientes } from '../../lib/api/caja';

export type Conexion = 'conectando' | 'en_linea' | 'sin_conexion';

const INTERVALO_MS = 3_000;
/** La API dijo que no (credencial, tope): no tiene sentido insistir cada 3 s. */
const INTERVALO_TRAS_RECHAZO_MS = 15_000;
const INTERVALO_TRAS_TOPE_MS = 10_000;
/** Un corte aislado no se anuncia: el wifi de un local parpadea. */
const CORTES_PARA_AVISAR = 2;

/**
 * Los registros pendientes del local, consultados cada 3 segundos con
 * If-None-Match. Mientras la lista no cambie, la API contesta 304 y no viaja
 * nada.
 *
 * Con la pestana oculta no se consulta; al volver, se consulta en el acto.
 */
export function useRegistrosPendientes() {
  const [lista, setLista] = useState<readonly RegistroEnCaja[]>([]);
  const [ocultos, setOcultos] = useState<ReadonlySet<string>>(() => new Set());
  const [conexion, setConexion] = useState<Conexion>('conectando');
  /** Lo que dijo la API cuando se nego, tal cual: "Esta tablet no esta vinculada...". */
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    let etag: string | null = null;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let enCurso = false;
    let cortes = 0;

    const programar = (ms: number) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => void consultar(), ms);
    };

    async function consultar() {
      if (enCurso || controlador.signal.aborted) return;
      if (document.visibilityState === 'hidden') return;
      enCurso = true;
      const r = await registrosPendientes(etag, controlador.signal);
      enCurso = false;
      if (controlador.signal.aborted || (!r.ok && r.tipo === 'cancelado')) return;

      if (r.ok) {
        cortes = 0;
        setConexion('en_linea');
        setProblema(null);
        if (r.tipo === 'nuevos') {
          etag = r.etag;
          const ids = new Set(r.datos.registros.map((x) => x.id));
          setLista(r.datos.registros);
          // Lo que se oculto a mano y la API ya no manda, deja de importar.
          setOcultos((prev) => new Set([...prev].filter((id) => ids.has(id))));
        }
        programar(INTERVALO_MS);
        return;
      }

      if (r.tipo === 'incierto') {
        cortes += 1;
        if (cortes >= CORTES_PARA_AVISAR) setConexion('sin_conexion');
        programar(INTERVALO_MS);
        return;
      }

      // Contesto, asi que hay conexion. Lo que falla es otra cosa.
      setConexion('en_linea');
      setProblema(r.mensaje);
      programar(r.estado === 429 ? INTERVALO_TRAS_TOPE_MS : INTERVALO_TRAS_RECHAZO_MS);
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') programar(0);
      else clearTimeout(temporizador);
    };

    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    void consultar();
    return () => {
      controlador.abort();
      clearTimeout(temporizador);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, []);

  /**
   * Saca un registro ya resuelto sin esperar la proxima consulta. Si una
   * consulta que salio antes de confirmar vuelve con el registro adentro,
   * sigue oculto.
   */
  const ocultar = useCallback((id: string) => {
    setOcultos((prev) => new Set(prev).add(id));
  }, []);

  const registros = useMemo(
    () => lista.filter((r) => !ocultos.has(r.id)),
    [lista, ocultos],
  );

  return { registros, conexion, problema, ocultar };
}

/** La hora, refrescada cada tanto: para "hace 3 min" alcanza. */
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}
