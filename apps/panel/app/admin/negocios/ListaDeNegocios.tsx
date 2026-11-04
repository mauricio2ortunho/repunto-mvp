'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type NegocioDelAdmin, tituloDeRubro } from '@repunto/contratos';
import { Aviso, Boton, LogoDelNegocio, variablesDeMarca } from '@repunto/ui';

import { promoEnTexto } from '../../../lib/alta-de-negocio';
import * as api from '../../../lib/api/admin';
import { avisosDelNegocio, localesEnTexto } from '../../../lib/negocios-del-admin';
import css from '../Admin.module.css';
import { useSesionDeAdmin } from '../usar-sesion';
import estilos from './Negocios.module.css';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; negocios: NegocioDelAdmin[] }
  | { tipo: 'error'; mensaje: string };

/** Todos los negocios de la plataforma, con lo que le falta a cada uno. */
export function ListaDeNegocios() {
  const router = useRouter();
  const { aEntrar } = useSesionDeAdmin();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.negocios(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', negocios: r.datos.negocios });
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

  return (
    <main className={css.pantalla}>
      <header className={css.encabezado}>
        <div>
          <Link href="/admin" className={estilos.volver}>
            ‹ Administración
          </Link>
          <h1 className={css.titulo}>Negocios</h1>
        </div>
        <Boton onClick={() => router.push('/admin/negocios/nuevo')}>Nuevo negocio</Boton>
      </header>

      {estado.tipo === 'cargando' && <p className={css.texto}>Cargando negocios…</p>}

      {estado.tipo === 'error' && (
        <div className={estilos.problema}>
          <Aviso mensaje={estado.mensaje} />
          <Boton variante="secundario" onClick={() => void consultar()}>
            Probar de nuevo
          </Boton>
        </div>
      )}

      {estado.tipo === 'listo' && estado.negocios.length === 0 && (
        <p className={css.texto}>
          Todavía no hay negocios. Tocá <strong>Nuevo negocio</strong> para dar de alta el
          primero.
        </p>
      )}

      {estado.tipo === 'listo' && estado.negocios.length > 0 && (
        <ul className={estilos.lista}>
          {estado.negocios.map((n) => (
            <li key={n.id}>
              <Link href={`/admin/negocios/${n.id}`} className={estilos.enlace}>
                <FilaDeNegocio negocio={n} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilaDeNegocio({ negocio: n }: { negocio: NegocioDelAdmin }) {
  const avisos = avisosDelNegocio(n);
  return (
    <article className={estilos.negocio} data-estado={n.estado}>
      <div
        className={estilos.marca}
        data-superficie="marca"
        style={variablesDeMarca(n.color_principal)}
      >
        <LogoDelNegocio nombre={n.nombre} url={n.logo_url} />
      </div>
      <div className={estilos.datos}>
        <div className={estilos.nombre}>
          <h2>{n.nombre}</h2>
          {n.estado === 'suspendido' && (
            <span className={estilos.suspendido}>Suspendido</span>
          )}
        </div>
        <p className={estilos.detalle}>
          {tituloDeRubro(n.categoria)} · {localesEnTexto(n.locales_activos)}
        </p>
        {n.programa !== null && (
          <p>{promoEnTexto(n.programa.sellos_requeridos, n.programa.premio)}</p>
        )}
        {n.condicion !== null && (
          <p className={estilos.detalle}>Suma un sello: {n.condicion.texto}</p>
        )}
        {avisos.length > 0 && (
          <ul className={estilos.avisos}>
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
