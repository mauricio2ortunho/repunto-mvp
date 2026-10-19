import { useEffect, useRef } from 'react';
import css from './TecladoDePin.module.css';

interface Props {
  /** Lo tecleado hasta ahora. Solo digitos. */
  valor: string;
  largo: number;
  alCambiar: (valor: string) => void;
  deshabilitado: boolean;
  /** Para lectores de pantalla: de quien es el PIN. */
  etiqueta: string;
}

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * Un teclado de PIN en pantalla, con teclas del tamano de un dedo apurado.
 *
 * En pantalla y no el teclado del sistema: en una tablet, el del sistema tapa
 * media caja y aparece y desaparece. Igual se puede tipear con un teclado
 * fisico, si la tablet tiene uno.
 *
 * Los digitos no se muestran: solo cuantos van. El PIN no se deja ver por
 * encima del hombro.
 */
export function TecladoDePin({
  valor,
  largo,
  alCambiar,
  deshabilitado,
  etiqueta,
}: Props) {
  // El listener del teclado fisico lee siempre lo ultimo, sin volver a
  // registrarse en cada digito.
  const actual = useRef({ valor, alCambiar, deshabilitado, largo });
  actual.current = { valor, alCambiar, deshabilitado, largo };

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const a = actual.current;
      if (a.deshabilitado || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^\d$/.test(e.key) && a.valor.length < a.largo) {
        e.preventDefault();
        a.alCambiar(a.valor + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        a.alCambiar(a.valor.slice(0, -1));
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const agregar = (digito: string) => {
    if (valor.length < largo) alCambiar(valor + digito);
  };

  return (
    <div className={css.teclado} role="group" aria-label={etiqueta}>
      <div
        className={css.puntos}
        role="status"
        aria-label={`${valor.length} de ${largo} dígitos`}
      >
        {Array.from({ length: largo }, (_, i) => (
          <span
            key={i}
            className={css.punto}
            data-lleno={i < valor.length || undefined}
          />
        ))}
      </div>
      <div className={css.teclas}>
        {TECLAS.map((d) => (
          <button
            key={d}
            type="button"
            className={css.tecla}
            disabled={deshabilitado}
            onClick={() => agregar(d)}
          >
            {d}
          </button>
        ))}
        <span aria-hidden="true" />
        <button
          type="button"
          className={css.tecla}
          disabled={deshabilitado}
          onClick={() => agregar('0')}
        >
          0
        </button>
        <button
          type="button"
          className={css.tecla}
          data-borrar
          disabled={deshabilitado || valor.length === 0}
          onClick={() => alCambiar(valor.slice(0, -1))}
          aria-label="Borrar el último dígito"
        >
          <svg
            viewBox="0 0 24 24"
            width="28"
            height="28"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="m12 9 6 6m0-6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
