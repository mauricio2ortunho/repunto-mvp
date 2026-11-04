'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useRef, useState } from 'react';
import {
  COLORES_SUGERIDOS_DE_NEGOCIO,
  ICONOS_DE_SELLO,
  LIMITES_DEL_NEGOCIO,
  PLANTILLAS_DE_TARJETA,
  RUBROS_DE_NEGOCIO,
  TITULOS_DE_RUBRO,
  esRubroDeNegocio,
} from '@repunto/contratos';
import { Aviso, Boton, DIBUJO_DE_SELLO } from '@repunto/ui';

import {
  BORRADOR_INICIAL,
  type Borrador,
  type Campo,
  TITULOS_DE_ICONO,
  TITULOS_DE_PLANTILLA,
  revisar,
} from '../../../../lib/alta-de-negocio';
import * as api from '../../../../lib/api/admin';
import { crearGestorDeIdempotencia } from '../../../../lib/api/idempotencia';
import css from '../../Admin.module.css';
import { useSesionDeAdmin } from '../../usar-sesion';
import estilos from '../Negocios.module.css';
import { VistaPrevia } from './VistaPrevia';

/**
 * El alta de un negocio: datos, apariencia, promo y condicion, todo junto, con
 * la tarjeta a la vista. Que se pueda dar de alta lo decide la api; aca solo
 * se avisa que corregir antes de mandar (`revisar`).
 */
export function NuevoNegocio() {
  const router = useRouter();
  const { aEntrar } = useSesionDeAdmin();
  const [b, setB] = useState<Borrador>({ ...BORRADOR_INICIAL });
  const [problemas, setProblemas] = useState<Partial<Record<Campo, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Una clave por alta: si la respuesta no llega y se vuelve a tocar, viaja
  // la misma y la api no crea dos negocios.
  const idempotencia = useRef(crearGestorDeIdempotencia());

  const poner = <K extends Campo>(campo: K, valor: Borrador[K]) => {
    setB((actual) => ({ ...actual, [campo]: valor }));
    // Lo que decia el aviso ya puede no ser cierto: se vuelve a revisar al mandar.
    setAviso(null);
    setProblemas((actuales) => {
      const resto = { ...actuales };
      delete resto[campo];
      return resto;
    });
  };

  const enviar = async () => {
    if (enviando) return;
    setAviso(null);
    const revision = revisar(b);
    if (!revision.ok) {
      setProblemas(revision.problemas);
      setAviso('Faltan datos o hay algo para corregir: está marcado en rojo.');
      return;
    }
    setProblemas({});
    setEnviando(true);
    const firma = `alta:${JSON.stringify(revision.peticion)}`;
    const r = await api.crearNegocio(
      revision.peticion,
      idempotencia.current.clavePara(firma),
    );
    if (r.ok) {
      idempotencia.current.olvidar(firma);
      router.push('/admin/negocios');
      return;
    }
    setEnviando(false);
    if (r.tipo === 'rechazo') {
      idempotencia.current.olvidar(firma);
      if (api.sesionPerdida(r)) return aEntrar();
      setAviso(api.mensajeParaElAdmin(r));
      return;
    }
    setAviso(
      `${api.mensajeParaElAdmin(r)} Si volvés a tocar "Dar de alta", no se crea dos veces.`,
    );
  };

  const L = LIMITES_DEL_NEGOCIO;

  return (
    <main className={css.pantalla}>
      <header>
        <Link href="/admin/negocios" className={estilos.volver}>
          ‹ Negocios
        </Link>
        <h1 className={css.titulo}>Nuevo negocio</h1>
      </header>

      <div className={estilos.alta}>
        <form
          className={estilos.formulario}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>El negocio</legend>
            <Etiquetado id="nombre" titulo="Nombre" problema={problemas.nombre}>
              <input
                id="nombre"
                className={estilos.entrada}
                value={b.nombre}
                maxLength={L.nombre}
                autoComplete="off"
                onChange={(e) => poner('nombre', e.target.value)}
              />
            </Etiquetado>
            <Etiquetado id="rubro" titulo="Rubro" problema={problemas.categoria}>
              <select
                id="rubro"
                className={estilos.entrada}
                value={b.categoria}
                onChange={(e) => {
                  const v = e.target.value;
                  poner('categoria', esRubroDeNegocio(v) ? v : '');
                }}
              >
                <option value="">Elegí el rubro</option>
                {RUBROS_DE_NEGOCIO.map((r) => (
                  <option key={r} value={r}>
                    {TITULOS_DE_RUBRO[r]}
                  </option>
                ))}
              </select>
            </Etiquetado>
          </fieldset>

          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>Cómo se ve</legend>
            <div className={estilos.etiquetado}>
              <span className={css.etiqueta}>Color</span>
              <div className={estilos.colores}>
                {COLORES_SUGERIDOS_DE_NEGOCIO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={estilos.muestra}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                    aria-pressed={b.color.toUpperCase() === c}
                    onClick={() => poner('color', c)}
                  />
                ))}
                <label className={estilos.otroColor}>
                  <input
                    type="color"
                    value={b.color}
                    onChange={(e) => poner('color', e.target.value.toUpperCase())}
                  />
                  Otro
                </label>
              </div>
              <p className={estilos.ayuda}>
                El texto encima se pone blanco o negro solo, para que siempre se lea.
              </p>
              {problemas.color !== undefined && (
                <p className={estilos.error}>{problemas.color}</p>
              )}
            </div>

            <div className={estilos.etiquetado}>
              <span className={css.etiqueta}>Ícono del sello</span>
              <div className={estilos.opciones} role="radiogroup" aria-label="Ícono">
                {ICONOS_DE_SELLO.map((i) => (
                  <label key={i} className={estilos.opcion}>
                    <input
                      type="radio"
                      name="icono"
                      checked={b.icono === i}
                      onChange={() => poner('icono', i)}
                    />
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      {DIBUJO_DE_SELLO[i]}
                    </svg>
                    {TITULOS_DE_ICONO[i]}
                  </label>
                ))}
              </div>
              <p className={estilos.ayuda}>
                El logo como sello llega cuando se puedan subir imágenes.
              </p>
            </div>

            <div className={estilos.etiquetado}>
              <span className={css.etiqueta}>Plantilla de la tarjeta</span>
              <div className={estilos.opciones} role="radiogroup" aria-label="Plantilla">
                {PLANTILLAS_DE_TARJETA.map((p) => (
                  <label key={p} className={estilos.opcion}>
                    <input
                      type="radio"
                      name="plantilla"
                      checked={b.plantilla === p}
                      onChange={() => poner('plantilla', p)}
                    />
                    {TITULOS_DE_PLANTILLA[p]}
                  </label>
                ))}
              </div>
              <p className={estilos.ayuda}>
                Por ahora las tres se ven igual: cambian cuando estén terminados los
                diseños.
              </p>
            </div>
          </fieldset>

          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>La promo</legend>
            <div className={estilos.fila}>
              <Etiquetado
                id="sellos"
                titulo="Sellos para el premio"
                problema={problemas.sellos}
              >
                <input
                  id="sellos"
                  className={estilos.entrada}
                  inputMode="numeric"
                  value={b.sellos}
                  onChange={(e) => poner('sellos', e.target.value)}
                />
              </Etiquetado>
              <Etiquetado
                id="horas"
                titulo="Horas mínimas entre sellos"
                problema={problemas.horasEntreSellos}
              >
                <input
                  id="horas"
                  className={estilos.entrada}
                  inputMode="numeric"
                  value={b.horasEntreSellos}
                  onChange={(e) => poner('horasEntreSellos', e.target.value)}
                />
              </Etiquetado>
            </div>
            <Etiquetado id="premio" titulo="Premio" problema={problemas.premio}>
              <input
                id="premio"
                className={estilos.entrada}
                value={b.premio}
                maxLength={L.premio}
                placeholder="Un café gratis"
                onChange={(e) => poner('premio', e.target.value)}
              />
            </Etiquetado>

            <label className={estilos.casilla}>
              <input
                type="checkbox"
                checked={b.vence}
                onChange={(e) => poner('vence', e.target.checked)}
              />
              La tarjeta vence
            </label>
            {b.vence && (
              <Etiquetado
                id="vigencia"
                titulo="Meses desde el primer sello"
                problema={problemas.vigenciaMeses}
              >
                <input
                  id="vigencia"
                  className={estilos.entrada}
                  inputMode="numeric"
                  value={b.vigenciaMeses}
                  onChange={(e) => poner('vigenciaMeses', e.target.value)}
                />
              </Etiquetado>
            )}
            <label className={estilos.casilla}>
              <input
                type="checkbox"
                checked={b.canjeCualquierLocal}
                onChange={(e) => poner('canjeCualquierLocal', e.target.checked)}
              />
              El premio se canjea en cualquier sucursal
            </label>
            <label className={estilos.casilla}>
              <input
                type="checkbox"
                checked={b.pideMonto}
                onChange={(e) => poner('pideMonto', e.target.checked)}
              />
              Pedir el monto de la compra después de sellar
            </label>
          </fieldset>

          <fieldset className={estilos.grupo} disabled={enviando}>
            <legend>La condición del sello</legend>
            <p className={estilos.ayuda}>
              Qué compra suma un sello. El negocio la puede cambiar cuando quiera; queda
              firmada por Administración.
            </p>
            <Etiquetado id="condicion" titulo="Condición" problema={problemas.condicion}>
              <input
                id="condicion"
                className={estilos.entrada}
                value={b.condicion}
                maxLength={L.condicion}
                placeholder="Cualquier bebida caliente"
                onChange={(e) => poner('condicion', e.target.value)}
              />
            </Etiquetado>
            <Etiquetado
              id="monto"
              titulo="Monto mínimo en Bs (opcional)"
              problema={problemas.montoMinimo}
            >
              <input
                id="monto"
                className={estilos.entrada}
                inputMode="decimal"
                value={b.montoMinimo}
                onChange={(e) => poner('montoMinimo', e.target.value)}
              />
            </Etiquetado>
          </fieldset>

          {aviso !== null && <Aviso mensaje={aviso} />}
          <Boton type="submit" tamano="grande" disabled={enviando}>
            {enviando ? 'Dando de alta…' : 'Dar de alta'}
          </Boton>
        </form>

        <VistaPrevia borrador={b} />
      </div>
    </main>
  );
}

function Etiquetado(p: {
  id: string;
  titulo: string;
  problema: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={estilos.etiquetado}
      data-problema={p.problema !== undefined || undefined}
    >
      <label className={css.etiqueta} htmlFor={p.id}>
        {p.titulo}
      </label>
      {p.children}
      {p.problema !== undefined && <p className={estilos.error}>{p.problema}</p>}
    </div>
  );
}
