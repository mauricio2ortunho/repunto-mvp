'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { type SolicitudDelAdmin, tituloDeRubro } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import * as api from '../../../lib/api/admin';
import { fechaYHora } from '../../../lib/fechas';
import { telefonoParaVer } from '../../../lib/personas-del-admin';
import {
  TITULOS_DE_ESTADO,
  chatConQuienPidio,
  separarSolicitudes,
} from '../../../lib/solicitudes-del-admin';
import css from '../Admin.module.css';
import estilos from '../negocios/Negocios.module.css';
import { useSesionDeAdmin } from '../usar-sesion';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; solicitudes: SolicitudDelAdmin[] }
  | { tipo: 'error'; mensaje: string };

/**
 * Los negocios que pidieron sumarse desde la app. Darlos de alta abre el alta
 * de siempre, ya completa; rechazar los guarda con su motivo. Nada se crea
 * ni se borra solo.
 */
export function ListaDeSolicitudes() {
  const { aEntrar } = useSesionDeAdmin();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const consultar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.solicitudes(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', solicitudes: r.datos.solicitudes });
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
          <h1 className={css.titulo}>Solicitudes</h1>
          <p className={css.texto}>Negocios que pidieron sumarse desde la app.</p>
        </div>
      </header>

      {estado.tipo === 'cargando' && <p className={css.texto}>Buscando solicitudes…</p>}
      {estado.tipo === 'error' && (
        <div className={estilos.problema}>
          <Aviso mensaje={estado.mensaje} />
          <Boton variante="secundario" onClick={() => void consultar()}>
            Probar de nuevo
          </Boton>
        </div>
      )}
      {estado.tipo === 'listo' && (
        <Listas solicitudes={estado.solicitudes} alCambiar={() => void consultar()} />
      )}
    </main>
  );
}

function Listas(p: { solicitudes: SolicitudDelAdmin[]; alCambiar: () => void }) {
  const { pendientes, resueltas } = separarSolicitudes(p.solicitudes);
  return (
    <>
      {pendientes.length === 0 ? (
        <p className={css.texto}>No hay solicitudes pendientes.</p>
      ) : (
        <ul className={estilos.locales}>
          {pendientes.map((s) => (
            <Pendiente key={s.id} solicitud={s} alCambiar={p.alCambiar} />
          ))}
        </ul>
      )}
      {resueltas.length > 0 && (
        <details className={estilos.historial}>
          <summary>Resueltas ({resueltas.length})</summary>
          <ul className={estilos.locales}>
            {resueltas.map((s) => (
              <li key={s.id} className={estilos.local}>
                <div className={estilos.datosDelLocal}>
                  <strong>{s.nombre_negocio}</strong>
                  <span className={estilos.detalle}>
                    {TITULOS_DE_ESTADO[s.estado]}
                    {s.resuelta_el !== null && ` el ${fechaYHora(s.resuelta_el)}`} ·{' '}
                    {s.contacto}, {telefonoParaVer(s.telefono)}
                  </span>
                  {s.motivo_rechazo !== null && (
                    <span className={estilos.ayuda}>Motivo: {s.motivo_rechazo}</span>
                  )}
                  {s.negocio_id !== null && (
                    <Link
                      className={estilos.enlaceSimple}
                      href={`/admin/negocios/${s.negocio_id}`}
                    >
                      Ver la ficha
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Pendiente(p: { solicitud: SolicitudDelAdmin; alCambiar: () => void }) {
  const router = useRouter();
  const { solicitud: s } = p;
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { aEntrar } = useSesionDeAdmin();

  const rechazar = async () => {
    setEnviando(true);
    setAviso(null);
    const r = await api.rechazarSolicitud(
      s.id,
      motivo.trim() === '' ? null : motivo.trim(),
    );
    setEnviando(false);
    if (r.ok) return p.alCambiar();
    if (api.sesionPerdida(r)) return aEntrar();
    setAviso(api.mensajeParaElAdmin(r));
  };

  return (
    <li className={estilos.local}>
      <div className={estilos.datosDelLocal}>
        <strong>{s.nombre_negocio}</strong>
        <span className={estilos.detalle}>
          {tituloDeRubro(s.categoria)} · pedida el {fechaYHora(s.creado_el)}
        </span>
        <span>
          {s.contacto} ·{' '}
          <a className={estilos.enlaceSimple} href={`tel:${s.telefono}`}>
            {telefonoParaVer(s.telefono)}
          </a>
        </span>
        {s.mensaje !== null && <span className={estilos.ayuda}>“{s.mensaje}”</span>}
      </div>

      {rechazando ? (
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void rechazar();
          }}
        >
          <label className={estilos.etiquetado} htmlFor={`motivo-${s.id}`}>
            <span className={css.etiqueta}>Motivo (opcional, solo lo ves vos)</span>
            <input
              id={`motivo-${s.id}`}
              className={estilos.entrada}
              value={motivo}
              maxLength={300}
              placeholder="Fuera de Santa Cruz"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <div className={estilos.acciones}>
            <Boton type="submit" disabled={enviando}>
              {enviando ? 'Rechazando…' : 'Rechazar'}
            </Boton>
            <Boton
              variante="texto"
              disabled={enviando}
              onClick={() => setRechazando(false)}
            >
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        <div className={estilos.acciones}>
          <Boton onClick={() => router.push(`/admin/negocios/nuevo?solicitud=${s.id}`)}>
            Dar de alta
          </Boton>
          <a
            className={estilos.enlaceDeAccion}
            href={chatConQuienPidio(s)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Escribirle por WhatsApp
          </a>
          <Boton variante="texto" onClick={() => setRechazando(true)}>
            Rechazar
          </Boton>
        </div>
      )}
      {aviso !== null && <Aviso mensaje={aviso} />}
    </li>
  );
}
