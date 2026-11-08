'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DuenoActual } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../lib/api/dueno';
import css from './Dueno.module.css';
import { Resumen } from './Resumen';
import { useSesionDeDueno } from './usar-sesion';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; dueno: DuenoActual }
  | { tipo: 'error'; mensaje: string };

/**
 * La entrada del panel del dueño: quién es, de qué negocio, y el resumen de
 * cómo le va. Sin sesión, o con una que la api ya no acepta, manda a
 * /dueno/entrar.
 */
export function InicioDelDueno() {
  const { aEntrar } = useSesionDeDueno();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.duenoActual(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', dueno: r.datos });
      if (api.sesionPerdida(r)) return aEntrar();
      setEstado({ tipo: 'error', mensaje: api.mensajeParaElDueno(r) });
    },
    [aEntrar],
  );

  useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  const salir = async () => {
    // Si no llega, la sesión igual vence sola; lo importante es que este
    // celular la olvide.
    await api.cerrarSesion();
    aEntrar();
  };

  if (estado.tipo === 'cargando') {
    return (
      <main className={css.centrada}>
        <p className={css.texto}>Abriendo tu negocio…</p>
      </main>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <main className={css.centrada}>
        <div className={css.tarjeta}>
          <Aviso mensaje={estado.mensaje} />
          <Boton onClick={() => void consultar()}>Probar de nuevo</Boton>
        </div>
      </main>
    );
  }

  const { dueno } = estado;
  return (
    <main className={css.pantalla}>
      <header className={css.encabezado}>
        <div>
          <p className={css.marca}>{dueno.negocio.nombre}</p>
          <h1 className={css.titulo}>Hola, {dueno.nombre}</h1>
        </div>
        <Boton variante="texto" onClick={() => void salir()}>
          Salir
        </Boton>
      </header>

      {dueno.negocio.estado === 'suspendido' && (
        <Aviso mensaje="Tu negocio está suspendido: tus clientes no pueden juntar sellos ni canjear. Hablá con Repunto." />
      )}

      <Resumen aEntrar={aEntrar} />
    </main>
  );
}
