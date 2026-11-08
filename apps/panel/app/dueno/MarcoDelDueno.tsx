'use client';

import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type { DuenoActual } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../lib/api/dueno';
import css from './Dueno.module.css';
import { useSesionDeDueno } from './usar-sesion';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; dueno: DuenoActual }
  | { tipo: 'error'; mensaje: string };

/** Las pestañas del panel del dueño, en el orden en que se muestran. */
const SECCIONES = [
  { id: 'resumen', ruta: '/dueno', titulo: 'Resumen' },
  { id: 'promo', ruta: '/dueno/promo', titulo: 'Tu promo' },
  { id: 'locales', ruta: '/dueno/locales', titulo: 'Locales' },
  { id: 'equipo', ruta: '/dueno/equipo', titulo: 'Equipo' },
] as const;

export type SeccionDelDueno = (typeof SECCIONES)[number]['id'];

/**
 * Lo común a toda pantalla del panel del dueño: quién es, de qué negocio y
 * las pestañas. La sección se dibuja recién cuando la sesión está
 * confirmada; sin sesión, o con una que la api ya no acepta, manda a
 * /dueno/entrar.
 */
export function MarcoDelDueno(p: { seccion: SeccionDelDueno; children: ReactNode }) {
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

      <nav className={css.pestanas} aria-label="Secciones">
        {SECCIONES.map((s) => (
          <Link
            key={s.id}
            href={s.ruta}
            className={css.pestana}
            aria-current={s.id === p.seccion ? 'page' : undefined}
          >
            {s.titulo}
          </Link>
        ))}
      </nav>

      {dueno.negocio.estado === 'suspendido' && (
        <Aviso mensaje="Tu negocio está suspendido: tus clientes no pueden juntar sellos ni canjear. Hablá con Repunto." />
      )}

      {p.children}
    </main>
  );
}
