'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type { NegocioDelDueno } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../lib/api/dueno';
import type { Fallo } from '../../lib/api/http';
import { SeccionLocales } from '../admin/negocios/[id]/Locales';
import { SeccionPersonas } from '../admin/negocios/[id]/Personas';
import css from './Dueno.module.css';
import { useSesionDeDueno } from './usar-sesion';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; negocio: NegocioDelDueno }
  | { tipo: 'error'; mensaje: string };

interface PropsDeSeccion {
  negocio: NegocioDelDueno;
  fallo: (f: Fallo) => string | null;
  alCambiar: () => void;
}

/**
 * Sus locales con sus tablets: las mismas pantallas que la ficha del admin,
 * con lo que el dueño puede hacer (`OPERACIONES_DEL_DUENO`): edita sus
 * locales, imprime el cartel del QR, vincula y revoca tablets.
 */
export function LocalesDelDueno() {
  return (
    <ConElNegocio
      cargando="Buscando tus locales…"
      seccion={(p) => (
        <SeccionLocales
          negocio={p.negocio}
          ops={api.OPERACIONES_DEL_DUENO}
          fallo={p.fallo}
          alCambiar={p.alCambiar}
        />
      )}
    />
  );
}

/** Sus cajeros y supervisores: cargarlos, su PIN, sus locales, la baja. */
export function EquipoDelDueno() {
  return (
    <ConElNegocio
      cargando="Buscando tu equipo…"
      seccion={(p) => (
        <SeccionPersonas
          negocio={p.negocio}
          ops={api.OPERACIONES_DEL_DUENO}
          fallo={p.fallo}
          alCambiar={p.alCambiar}
        />
      )}
    />
  );
}

/** Pide el negocio, y lo vuelve a pedir cada vez que la sección cambia algo. */
function ConElNegocio(p: {
  cargando: string;
  seccion: (p: PropsDeSeccion) => ReactNode;
}) {
  const { aEntrar } = useSesionDeDueno();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  /** Lo común a todo pedido que falla: sesión perdida, o un texto. */
  const fallo = useCallback(
    (f: Fallo): string | null => {
      if (api.sesionPerdida(f)) {
        aEntrar();
        return null;
      }
      return api.mensajeParaElDueno(f);
    },
    [aEntrar],
  );

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.negocio(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', negocio: r.datos });
      const mensaje = fallo(r);
      if (mensaje !== null) setEstado({ tipo: 'error', mensaje });
    },
    [fallo],
  );

  useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  if (estado.tipo === 'cargando') return <p className={css.texto}>{p.cargando}</p>;
  if (estado.tipo === 'error') {
    return (
      <div className={css.bloque}>
        <Aviso mensaje={estado.mensaje} />
        <Boton variante="secundario" onClick={() => void consultar()}>
          Probar de nuevo
        </Boton>
      </div>
    );
  }
  return (
    <div className={css.contenido}>
      {p.seccion({
        negocio: estado.negocio,
        fallo,
        alCambiar: () => void consultar(),
      })}
    </div>
  );
}
