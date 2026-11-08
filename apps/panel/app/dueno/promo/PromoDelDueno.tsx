'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PromoDelDueno as Promo } from '@repunto/contratos';
import { Aviso, Boton } from '@repunto/ui';

import {
  borradorDeLaPromo,
  promoEnTexto,
  revisarCondicion,
  revisarPrograma,
} from '../../../lib/alta-de-negocio';
import * as api from '../../../lib/api/dueno';
import type { Fallo } from '../../../lib/api/http';
import { crearGestorDeIdempotencia } from '../../../lib/api/idempotencia';
import { fechaYHora } from '../../../lib/fechas';
import {
  avisoDeTarjetasEnCurso,
  describirPrograma,
} from '../../../lib/negocios-del-admin';
import { autorParaElDueno, tarjetasEnCurso } from '../../../lib/promo-del-dueno';
import {
  CamposDeCondicion,
  CamposDePrograma,
  useFormulario,
} from '../../admin/negocios/Campos';
import estilos from '../../admin/negocios/Negocios.module.css';
import css from '../Dueno.module.css';
import { useSesionDeDueno } from '../usar-sesion';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'listo'; promo: Promo }
  | { tipo: 'error'; mensaje: string };

/**
 * La promo y la condición del sello, como las ve el dueño, y el cambio de
 * cada una. Los campos son los mismos que en la ficha del admin; lo que
 * cambia es de quién es la sesión y cómo se dice cada cosa.
 */
export function PromoDelDueno() {
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
      const r = await api.promo(senal);
      if (senal?.aborted === true) return;
      if (r.ok) return setEstado({ tipo: 'listo', promo: r.datos });
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

  if (estado.tipo === 'cargando') {
    return <p className={css.texto}>Buscando tu promo…</p>;
  }
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

  const { promo } = estado;
  const alGuardar = () => void consultar();
  return (
    <div className={css.contenido}>
      {/* La key reinicia el formulario cuando cambia lo guardado. */}
      <SeccionPromo
        key={`promo-${promo.programa?.version ?? 0}`}
        promo={promo}
        fallo={fallo}
        alGuardar={alGuardar}
      />
      <SeccionCondicion
        key={`condicion-${promo.condiciones[0]?.vigente_desde ?? ''}`}
        promo={promo}
        fallo={fallo}
        alGuardar={alGuardar}
      />
    </div>
  );
}

interface PropsDeSeccion {
  promo: Promo;
  fallo: (f: Fallo) => string | null;
  alGuardar: () => void;
}

/**
 * La promo vigente y el cambio. Cambiarla crea una versión nueva (INV-5):
 * antes de guardar se dice cuántas tarjetas siguen con la actual.
 */
function SeccionPromo(p: PropsDeSeccion) {
  const { programa, tarjetas_en_curso } = p.promo;
  const [editando, setEditando] = useState(programa === null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const f = useFormulario(
    borradorDeLaPromo(p.promo),
    useCallback(() => setAviso(null), []),
  );
  const idempotencia = useRef(crearGestorDeIdempotencia());

  const guardar = async () => {
    const revision = revisarPrograma(f.b);
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setGuardando(true);
    setAviso(null);
    const firma = `programa:${JSON.stringify(revision.peticion)}`;
    const r = await api.cambiarPrograma(
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
    <section className={estilos.grupo} aria-labelledby="tu-promo">
      <h2 id="tu-promo" className={estilos.tituloDeSeccion}>
        La promo
      </h2>
      {programa === null ? (
        <p className={estilos.advertencia} role="note">
          Todavía no tenés promo: la caja no puede sellar hasta que la cargues.
        </p>
      ) : (
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
            Desde el {fechaYHora(programa.desde)}. {tarjetasEnCurso(tarjetas_en_curso)}
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
              {avisoDeTarjetasEnCurso(tarjetas_en_curso)}
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
                  f.reiniciar(borradorDeLaPromo(p.promo));
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

/** Qué compra suma un sello, su historial y el cambio: vale desde ahora (INV-7). */
function SeccionCondicion(p: PropsDeSeccion) {
  const [vigente, ...anteriores] = p.promo.condiciones;
  const [editando, setEditando] = useState(vigente === undefined);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const f = useFormulario(
    borradorDeLaPromo(p.promo),
    useCallback(() => setAviso(null), []),
  );
  const idempotencia = useRef(crearGestorDeIdempotencia());

  const guardar = async () => {
    const revision = revisarCondicion(f.b);
    if (!revision.ok) return f.setProblemas(revision.problemas);
    setGuardando(true);
    setAviso(null);
    const firma = `condicion:${JSON.stringify(revision.peticion)}`;
    const r = await api.cambiarCondicion(
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
    <section className={estilos.grupo} aria-labelledby="tu-condicion">
      <h2 id="tu-condicion" className={estilos.tituloDeSeccion}>
        Qué compra suma un sello
      </h2>
      {vigente === undefined ? (
        <p className={estilos.advertencia} role="note">
          Todavía no dijiste qué compra suma un sello: la caja no puede sellar.
        </p>
      ) : (
        <div className={estilos.resumen}>
          <p className={estilos.destacado}>{vigente.texto}</p>
          {vigente.monto_minimo !== null && (
            <p>Monto mínimo: Bs {vigente.monto_minimo.replace('.', ',')}</p>
          )}
          <p className={estilos.detalle}>
            Desde el {fechaYHora(vigente.vigente_desde)}, por {autorParaElDueno(vigente)}.
          </p>
        </div>
      )}

      {!editando && (
        <Boton
          variante="secundario"
          className={estilos.alInicio}
          onClick={() => setEditando(true)}
        >
          Cambiar qué suma un sello
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
            Vale desde que la guardás, en todos tus locales. Los sellos ya dados no
            cambian. Tus cajeros la ven al sellar.
          </p>
          {aviso !== null && <Aviso mensaje={aviso} />}
          <div className={estilos.acciones}>
            <Boton type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Boton>
            {vigente !== undefined && (
              <Boton
                variante="texto"
                disabled={guardando}
                onClick={() => {
                  f.reiniciar(borradorDeLaPromo(p.promo));
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
          <summary>Las anteriores</summary>
          <ul>
            {anteriores.map((c) => (
              <li key={c.vigente_desde}>
                <strong>{c.texto}</strong>
                {c.monto_minimo !== null && ` · Bs ${c.monto_minimo.replace('.', ',')}`}
                <span className={estilos.detalle}>
                  {' '}
                  — desde el {fechaYHora(c.vigente_desde)}, por {autorParaElDueno(c)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
