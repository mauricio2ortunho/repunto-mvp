'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../lib/api/admin';
import { sesionDeAdmin } from '../../lib/sesion-de-admin';
import css from './Admin.module.css';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; nombre: string }
  | { tipo: 'error'; mensaje: string };

/**
 * La entrada del panel de administracion. Sin sesion, o con una que la api
 * ya no acepta, manda a /admin/entrar. Las secciones se van llenando en sus
 * etapas.
 */
export function InicioDeAdmin() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const aEntrar = useCallback(() => {
    sesionDeAdmin().olvidar();
    router.replace('/admin/entrar');
  }, [router]);

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      if (sesionDeAdmin().token() === null) return aEntrar();
      const r = await api.adminActual(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', nombre: r.datos.nombre });
      if (api.sesionPerdida(r)) return aEntrar();
      setEstado({ tipo: 'error', mensaje: api.mensajeParaElAdmin(r) });
    },
    [aEntrar],
  );

  useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  const salir = async () => {
    // Si no llega, la sesion igual vence sola; lo importante es que este
    // equipo la olvide.
    await api.cerrarSesion();
    aEntrar();
  };

  if (estado.tipo === 'cargando') {
    return (
      <main className={css.centrada}>
        <p className={css.texto}>Abriendo el panel…</p>
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

  return (
    <main className={css.pantalla}>
      <header className={css.encabezado}>
        <div>
          <p className={css.marca}>Repunto · Administración</p>
          <h1 className={css.titulo}>Hola, {estado.nombre}</h1>
        </div>
        <Boton variante="texto" onClick={() => void salir()}>
          Cerrar sesión
        </Boton>
      </header>

      <ul className={css.menu}>
        {SECCIONES.map((s) => (
          <li key={s.titulo}>
            <section className={css.seccion}>
              <h2>{s.titulo}</h2>
              <p>{s.texto}</p>
              <span className={css.pronto}>Próximamente</span>
            </section>
          </li>
        ))}
      </ul>
    </main>
  );
}

/** Las etapas del plan del panel; cada una se vuelve un enlace cuando exista. */
const SECCIONES = [
  {
    titulo: 'Negocios',
    texto: 'Alta, rubro, colores, logo, promo. Suspender y reactivar.',
  },
  { titulo: 'Locales', texto: 'Sucursales con su dirección y el QR para imprimir.' },
  {
    titulo: 'Personas',
    texto: 'El dueño, los supervisores y los cajeros, con sus locales.',
  },
  { titulo: 'Tablets', texto: 'Vincular y revocar las tablets de caja.' },
  {
    titulo: 'Tablero del piloto',
    texto: 'Último sello de cada tablet y clientes nuevos por local.',
  },
] as const;
