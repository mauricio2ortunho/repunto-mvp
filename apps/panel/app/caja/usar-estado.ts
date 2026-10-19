'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EstadoDeCaja } from '@repunto/contratos';
import { cerrarTurno as cerrarTurnoEnLaApi, estadoDeCaja } from '../../lib/api/caja';
import { crearBloqueo, type Bloqueo } from './bloqueo';

/** El turno lo abre o lo cierra otra persona: medio minuto de atraso alcanza. */
const CADA_MS = 30_000;

/**
 * Quien es esta caja y si puede operar, segun `GET /caja/estado`.
 *
 * Se consulta al abrir, cada medio minuto, al volver a la pestana y cuando lo
 * pide `revisar` (la caja lo llama tras cada rechazo). Un corte no borra lo
 * que se sabia: la caja sigue mostrando la ultima respuesta buena.
 */
export function useEstadoDeCaja() {
  const [datos, setDatos] = useState<EstadoDeCaja | null>(null);
  /** La API no reconoce el token: no hay estado que pedir. */
  const [sinCredencial, setSinCredencial] = useState<Bloqueo | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const pedirAhora = useRef<() => void>(() => undefined);

  useEffect(() => {
    let vivo = true;
    let enCurso = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const programar = (ms: number) => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => void consultar(), ms);
    };

    async function consultar() {
      if (enCurso || document.visibilityState === 'hidden') return;
      enCurso = true;
      setRevisando(true);
      const r = await estadoDeCaja();
      enCurso = false;
      if (!vivo) return;
      setRevisando(false);
      if (r.ok) {
        setDatos(r.datos);
        setSinCredencial(null);
      } else if (r.tipo === 'rechazo' && r.estado === 401) {
        setSinCredencial(crearBloqueo(r.codigo ?? 'TOKEN_INVALIDO', r.mensaje));
      }
      programar(CADA_MS);
    }

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') programar(0);
      else clearTimeout(temporizador);
    };

    pedirAhora.current = () => programar(0);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    void consultar();
    return () => {
      vivo = false;
      clearTimeout(temporizador);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, []);

  const revisar = useCallback(() => pedirAhora.current(), []);

  /**
   * Abrir y cerrar turno responden el estado entero: se usa ese, sin esperar
   * a la proxima consulta.
   */
  const aplicar = useCallback((nuevo: EstadoDeCaja) => {
    setDatos(nuevo);
    setSinCredencial(null);
  }, []);

  /** Por que la caja no puede operar, con su tono, o null si puede. */
  const impedimento = datos?.impedimento ?? null;
  const bloqueo: Bloqueo | null = useMemo(
    () => sinCredencial ?? (impedimento !== null ? crearBloqueo(impedimento) : null),
    [sinCredencial, impedimento],
  );

  /**
   * "Cerrar turno". Si no llega a contestar, se vuelve a preguntar el estado:
   * la caja muestra lo que de verdad quedo, no lo que se pidio.
   */
  const cerrarTurno = useCallback(async (): Promise<boolean> => {
    setCerrando(true);
    const r = await cerrarTurnoEnLaApi();
    setCerrando(false);
    if (r.ok) aplicar(r.datos);
    else pedirAhora.current();
    return r.ok;
  }, [aplicar]);

  return { datos, bloqueo, revisando, revisar, aplicar, cerrarTurno, cerrando };
}
