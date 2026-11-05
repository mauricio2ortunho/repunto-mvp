'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type FichaDelNegocio, tituloDeRubro } from '@repunto/contratos';
import { Aviso, Boton, BotonDeDosToques } from '@repunto/ui';

import {
  borradorDesde,
  promoEnTexto,
  revisarCondicion,
  revisarDatos,
  revisarPrograma,
} from '../../../../lib/alta-de-negocio';
import * as api from '../../../../lib/api/admin';
import type { Fallo } from '../../../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import { fechaYHora } from '../../../../lib/fechas';
import {
  autorDe,
  avisoDeTarjetasEnCurso,
  avisosDelNegocio,
  describirPrograma,
  localesEnTexto,
} from '../../../../lib/negocios-del-admin';
import css from '../../Admin.module.css';
import { useSesionDeAdmin } from '../../usar-sesion';
import {
  CamposDeCondicion,
  CamposDeDatos,
  CamposDePrograma,
  useFormulario,
} from '../Campos';
import estilos from '../Negocios.module.css';
import { VistaPrevia } from '../nuevo/VistaPrevia';
import { SeccionLocales } from './Locales';
import { SeccionPersonas } from './Personas';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; ficha: FichaDelNegocio }
  | { tipo: 'error'; mensaje: string };

/**
 * La ficha de un negocio. Cada parte se guarda sola y dice que pasa al
 * guardarla: la apariencia cambia todas las tarjetas, la promo solo las que
 * se abran desde ahora, la condicion solo los sellos de desde ahora.
 */
export function Ficha() {
  const { id } = useParams<{ id: string }>();
  const { aEntrar } = useSesionDeAdmin();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  /** Lo comun a todo pedido que falla: sesion perdida, o un texto. */
  const fallo = useCallback(
    (f: Fallo): string | null => {
      if (api.sesionPerdida(f)) {
        aEntrar();
        return null;
      }
      return api.mensajeParaElAdmin(f);
    },
    [aEntrar],
  );

  const cargar = useCallback(
    async (senal?: AbortSignal) => {
      const r = await api.ficha(id, senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', ficha: r.datos });
      const mensaje = fallo(r);
      if (mensaje !== null) setEstado({ tipo: 'error', mensaje });
    },
    [id, fallo],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  const volver = (
    <Link href="/admin/negocios" className={estilos.volver}>
      ‹ Negocios
    </Link>
  );

  if (estado.tipo === 'cargando') {
    return (
      <main className={css.pantalla}>
        {volver}
        <p className={css.texto}>Cargando el negocio…</p>
      </main>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <main className={css.pantalla}>
        {volver}
        <div className={estilos.problema}>
          <Aviso mensaje={estado.mensaje} />
          <Boton variante="secundario" onClick={() => void cargar()}>
            Probar de nuevo
          </Boton>
        </div>
      </main>
    );
  }

  const { ficha } = estado;
  const poner = (f: FichaDelNegocio) => setEstado({ tipo: 'listo', ficha: f });
  const avisos = avisosDelNegocio({
    ...ficha,
    condicion: ficha.condiciones[0] ?? null,
  });

  return (
    <main className={css.pantalla}>
      <header className={css.encabezado}>
        <div>
          {volver}
          <div className={estilos.nombre}>
            <h1 className={css.titulo}>{ficha.nombre}</h1>
            {ficha.estado === 'suspendido' && (
              <span className={estilos.suspendido}>Suspendido</span>
            )}
          </div>
          <p className={estilos.detalle}>
            {tituloDeRubro(ficha.categoria)} · {localesEnTexto(ficha.locales_activos)} ·
            Alta: {fechaYHora(ficha.creado_el)}
          </p>
        </div>
        <Suspension ficha={ficha} fallo={fallo} alCambiar={() => void cargar()} />
      </header>

      {avisos.length > 0 && (
        <ul className={estilos.avisos}>
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <SeccionDatos ficha={ficha} fallo={fallo} alGuardar={poner} />
      <SeccionPromo
        key={`promo-${ficha.programa?.version ?? 0}`}
        ficha={ficha}
        fallo={fallo}
        alGuardar={() => void cargar()}
      />
      <SeccionCondicion
        key={`condicion-${ficha.condiciones[0]?.vigente_desde ?? ''}`}
        ficha={ficha}
        fallo={fallo}
        alGuardar={() => void cargar()}
      />
      <SeccionLocales ficha={ficha} fallo={fallo} alCambiar={() => void cargar()} />
      <SeccionPersonas ficha={ficha} fallo={fallo} alCambiar={() => void cargar()} />
    </main>
  );
}

interface PropsDeSeccion {
  ficha: FichaDelNegocio;
  fallo: (f: Fallo) => string | null;
}

function Suspension(p: PropsDeSeccion & { alCambiar: () => void }) {
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const suspendido = p.ficha.estado === 'suspendido';

  const cambiar = async () => {
    setTrabajando(true);
    setAviso(null);
    const r = await api.cambiarEstado(p.ficha.id, suspendido ? 'activo' : 'suspendido');
    setTrabajando(false);
    if (r.ok) return p.alCambiar();
    setAviso(p.fallo(r));
  };

  return (
    <div className={estilos.suspension}>
      {suspendido ? (
        <Boton variante="secundario" disabled={trabajando} onClick={() => void cambiar()}>
          {trabajando ? 'Reactivando…' : 'Reactivar'}
        </Boton>
      ) : (
        <BotonDeDosToques
          texto="Suspender"
          confirmar="Tocá de nuevo: la caja deja de sellar"
          trabajando={trabajando}
          textoTrabajando="Suspendiendo…"
          disabled={trabajando}
          alConfirmar={() => void cambiar()}
        />
      )}
      <p className={estilos.ayuda}>
        {suspendido
          ? 'No sella ni aparece en "Dónde juntar sellos". Las tarjetas siguen corriendo su vencimiento.'
          : 'Suspendido, la caja no sella y el negocio sale de "Dónde juntar sellos".'}
      </p>
      {aviso !== null && <Aviso mensaje={aviso} />}
    </div>
  );
}

/** Nombre, rubro, apariencia y canje: aplica a todas las tarjetas al instante. */
function SeccionDatos(p: PropsDeSeccion & { alGuardar: (f: FichaDelNegocio) => void }) {
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const f = useFormulario(
    borradorDesde(p.ficha),
    useCallback(() => {
      setAviso(null);
      setListo(false);
    }, []),
  );

  const guardar = async () => {
    const revision = revisarDatos(f.b);
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setGuardando(true);
    setAviso(null);
    const r = await api.guardarDatos(p.ficha.id, revision.peticion);
    setGuardando(false);
    if (r.ok) {
      p.alGuardar(r.datos);
      setListo(true);
      return;
    }
    setAviso(p.fallo(r));
  };

  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>El negocio y cómo se ve</h2>
      <div className={estilos.alta}>
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <fieldset className={estilos.sinMarco} disabled={guardando}>
            <CamposDeDatos f={f} />
          </fieldset>
          <p className={estilos.ayuda}>
            Se aplica al instante a todas las tarjetas, también a las que ya están en
            curso.
          </p>
          {aviso !== null && <Aviso mensaje={aviso} />}
          {listo && <p className={estilos.listo}>Guardado.</p>}
          <Boton type="submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </form>
        {/* La promo se cambia en su propia seccion: la tarjeta muestra la vigente. */}
        <VistaPrevia
          borrador={{
            ...f.b,
            sellos: String(p.ficha.programa?.sellos_requeridos ?? f.b.sellos),
            premio: p.ficha.programa?.premio ?? '',
          }}
        />
      </div>
    </section>
  );
}

/**
 * La promo vigente y el cambio de promo. Cambiarla crea una version nueva
 * (INV-5): antes de guardar se dice cuantas tarjetas siguen con la actual.
 */
function SeccionPromo(p: PropsDeSeccion & { alGuardar: () => void }) {
  const { programa } = p.ficha;
  const [editando, setEditando] = useState(programa === null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const f = useFormulario(
    borradorDesde(p.ficha),
    useCallback(() => setAviso(null), []),
  );
  const idempotencia = useRef(crearGestorDeIdempotencia());

  const guardar = async () => {
    const revision = revisarPrograma(f.b);
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setGuardando(true);
    setAviso(null);
    const firma = `programa:${p.ficha.id}:${JSON.stringify(revision.peticion)}`;
    const r = await api.cambiarPrograma(
      p.ficha.id,
      revision.peticion,
      idempotencia.current.clavePara(firma),
    );
    setGuardando(false);
    if (r.ok) {
      idempotencia.current.olvidar(firma);
      return p.alGuardar();
    }
    if (r.tipo === 'rechazo') idempotencia.current.olvidar(firma);
    setAviso(p.fallo(r));
  };

  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>La promo</h2>
      {programa !== null && (
        <div className={estilos.resumen}>
          <p className={estilos.destacado}>
            {promoEnTexto(programa.sellos_requeridos, programa.premio)}
          </p>
          <ul className={estilos.frases}>
            {describirPrograma(programa).map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
          <p className={estilos.detalle}>
            Versión {programa.version}, desde el {fechaYHora(programa.desde)}.{' '}
            {p.ficha.tarjetas_en_curso === 1
              ? '1 tarjeta en curso.'
              : `${p.ficha.tarjetas_en_curso} tarjetas en curso.`}
          </p>
        </div>
      )}

      {!editando && (
        <Boton
          variante="secundario"
          className={estilos.alInicio}
          onClick={() => setEditando(true)}
        >
          Cambiar la promo
        </Boton>
      )}

      {editando && (
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <fieldset className={estilos.sinMarco} disabled={guardando}>
            <CamposDePrograma f={f} />
          </fieldset>
          {programa !== null && (
            <p className={estilos.advertencia} role="note">
              {avisoDeTarjetasEnCurso(p.ficha.tarjetas_en_curso)}
            </p>
          )}
          {aviso !== null && <Aviso mensaje={aviso} />}
          <div className={estilos.acciones}>
            <Boton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar la promo nueva'}
            </Boton>
            {programa !== null && (
              <Boton
                variante="texto"
                disabled={guardando}
                onClick={() => {
                  f.reiniciar(borradorDesde(p.ficha));
                  setAviso(null);
                  setEditando(false);
                }}
              >
                Cancelar
              </Boton>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

/** La condicion vigente, su historial y el cambio: aplica desde ahora (INV-7). */
function SeccionCondicion(p: PropsDeSeccion & { alGuardar: () => void }) {
  const [vigente, ...anteriores] = p.ficha.condiciones;
  const [editando, setEditando] = useState(vigente === undefined);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const f = useFormulario(
    borradorDesde(p.ficha),
    useCallback(() => setAviso(null), []),
  );
  const idempotencia = useRef(crearGestorDeIdempotencia());

  const guardar = async () => {
    const revision = revisarCondicion(f.b);
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setGuardando(true);
    setAviso(null);
    const firma = `condicion:${p.ficha.id}:${JSON.stringify(revision.peticion)}`;
    const r = await api.cambiarCondicion(
      p.ficha.id,
      revision.peticion,
      idempotencia.current.clavePara(firma),
    );
    setGuardando(false);
    if (r.ok) {
      idempotencia.current.olvidar(firma);
      return p.alGuardar();
    }
    if (r.tipo === 'rechazo') idempotencia.current.olvidar(firma);
    setAviso(p.fallo(r));
  };

  return (
    <section className={estilos.grupo}>
      <h2 className={estilos.tituloDeSeccion}>La condición del sello</h2>
      {vigente !== undefined && (
        <div className={estilos.resumen}>
          <p className={estilos.destacado}>{vigente.texto}</p>
          {vigente.monto_minimo !== null && (
            <p>Monto mínimo: Bs {vigente.monto_minimo.replace('.', ',')}</p>
          )}
          <p className={estilos.detalle}>
            Desde el {fechaYHora(vigente.vigente_desde)}, por {autorDe(vigente)}.
          </p>
        </div>
      )}

      {!editando && (
        <Boton
          variante="secundario"
          className={estilos.alInicio}
          onClick={() => setEditando(true)}
        >
          Cambiar la condición
        </Boton>
      )}

      {editando && (
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          <fieldset className={estilos.sinMarco} disabled={guardando}>
            <CamposDeCondicion f={f} />
          </fieldset>
          <p className={estilos.ayuda}>
            Vale desde que se guarda. Los sellos ya dados no cambian.
          </p>
          {aviso !== null && <Aviso mensaje={aviso} />}
          <div className={estilos.acciones}>
            <Boton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar la condición'}
            </Boton>
            {vigente !== undefined && (
              <Boton
                variante="texto"
                disabled={guardando}
                onClick={() => {
                  f.reiniciar(borradorDesde(p.ficha));
                  setAviso(null);
                  setEditando(false);
                }}
              >
                Cancelar
              </Boton>
            )}
          </div>
        </form>
      )}

      {anteriores.length > 0 && (
        <details className={estilos.historial}>
          <summary>Condiciones anteriores</summary>
          <ul>
            {anteriores.map((c) => (
              <li key={c.vigente_desde}>
                <strong>{c.texto}</strong>
                {c.monto_minimo !== null && ` · Bs ${c.monto_minimo.replace('.', ',')}`}
                <span className={estilos.detalle}>
                  {' '}
                  — desde el {fechaYHora(c.vigente_desde)}, por {autorDe(c)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
