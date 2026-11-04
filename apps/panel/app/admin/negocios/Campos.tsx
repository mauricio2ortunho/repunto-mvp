'use client';

import { type ReactNode, useCallback, useState } from 'react';
import {
  COLORES_SUGERIDOS_DE_NEGOCIO,
  ICONOS_DE_SELLO,
  LIMITES_DEL_NEGOCIO,
  PLANTILLAS_DE_TARJETA,
  RUBROS_DE_NEGOCIO,
  TITULOS_DE_RUBRO,
  esRubroDeNegocio,
} from '@repunto/contratos';
import { DIBUJO_DE_SELLO } from '@repunto/ui';

import {
  type Borrador,
  type Campo,
  TITULOS_DE_ICONO,
  TITULOS_DE_PLANTILLA,
} from '../../../lib/alta-de-negocio';
import css from '../Admin.module.css';
import estilos from './Negocios.module.css';

/**
 * Los campos de un negocio, en tres partes: los usa el alta, todas juntas, y
 * la ficha, cada una con su boton de guardar. Solo dibujan: que se puede
 * mandar lo decide `revisarDatos`, `revisarPrograma` o `revisarCondicion`.
 */

export type Problemas = Partial<Record<Campo, string>>;

export interface Formulario {
  b: Borrador;
  problemas: Problemas;
  poner: <K extends Campo>(campo: K, valor: Borrador[K]) => void;
  setProblemas: (p: Problemas) => void;
  /** Vuelve a lo que el negocio tiene, al cancelar un cambio. */
  reiniciar: (b: Borrador) => void;
}

/**
 * El estado de un formulario de negocio. `alCambiar` corre en cada tecla:
 * sirve para borrar un aviso que ya puede no ser cierto.
 */
export function useFormulario(inicial: Borrador, alCambiar?: () => void): Formulario {
  const [b, setB] = useState<Borrador>(inicial);
  const [problemas, setProblemas] = useState<Problemas>({});

  const poner = useCallback(
    <K extends Campo>(campo: K, valor: Borrador[K]) => {
      setB((actual) => ({ ...actual, [campo]: valor }));
      setProblemas((actuales) => {
        const resto = { ...actuales };
        delete resto[campo];
        return resto;
      });
      alCambiar?.();
    },
    [alCambiar],
  );

  const reiniciar = useCallback((nuevo: Borrador) => {
    setB(nuevo);
    setProblemas({});
  }, []);

  return { b, problemas, poner, setProblemas, reiniciar };
}

interface PropsDeCampos {
  f: Formulario;
}

const L = LIMITES_DEL_NEGOCIO;

/** Nombre, rubro, color, icono, plantilla y donde se canjea. */
export function CamposDeDatos({ f }: PropsDeCampos) {
  const { b, poner, problemas } = f;
  return (
    <>
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
          Por ahora las tres se ven igual: cambian cuando estén terminados los diseños.
        </p>
      </div>

      <label className={estilos.casilla}>
        <input
          type="checkbox"
          checked={b.canjeCualquierLocal}
          onChange={(e) => poner('canjeCualquierLocal', e.target.checked)}
        />
        El premio se canjea en cualquier sucursal
      </label>
    </>
  );
}

/** Sellos, premio, vencimiento, horas entre sellos y monto. */
export function CamposDePrograma({ f }: PropsDeCampos) {
  const { b, poner, problemas } = f;
  return (
    <>
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
          checked={b.pideMonto}
          onChange={(e) => poner('pideMonto', e.target.checked)}
        />
        Pedir el monto de la compra después de sellar
      </label>
    </>
  );
}

/** Que compra suma un sello, con monto minimo opcional. */
export function CamposDeCondicion({ f }: PropsDeCampos) {
  const { b, poner, problemas } = f;
  return (
    <>
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
    </>
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
