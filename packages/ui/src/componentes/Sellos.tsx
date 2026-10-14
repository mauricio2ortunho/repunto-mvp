import type { CSSProperties } from 'react';
import type { IconoDeSello } from '@repunto/contratos';
import { useApariencia } from '../apariencia';
import { DIBUJO_DE_SELLO } from './IconosDeSello';
import css from './Sellos.module.css';

/**
 * La tarjeta de carton, en pantalla: un sello de tinta por cada sello, una
 * casilla vacia por cada uno que falta, y el premio en la ultima.
 *
 * Cuantas casillas hay sale de lo que mando la API (progreso + faltan). Aca no
 * se decide nada: solo se dibuja. Los colores salen de --c-sello y
 * --c-sobre-sello; el tamano, de --tamano-sello.
 *
 * El icono de cada sello y la plantilla salen de `AparienciaDeTarjeta`, que
 * los toma del negocio. La plantilla queda en `data-plantilla`: un aspecto
 * nuevo es un bloque en Sellos.module.css. Hoy las tres se ven como 'clasica'
 * hasta que diseno defina las otras dos.
 *
 * Es de diseno y no de la caja porque la app del cliente dibuja la misma
 * tarjeta.
 */

/** Cada sello cae un poco torcido, como cuando se estampa a mano. */
const GIROS = [-8, 5, -3, 9, -11, 2, 7, -6, 4, -2] as const;

/** Mas que esto no entra como tarjeta: se muestra la cuenta. */
const MAXIMO_DIBUJABLE = 30;

/**
 * Los filtros de tinta, una sola vez por pagina. Borde irregular y algun
 * hueco donde el sello no cargo tinta: lo que hace que parezca estampado y no
 * un circulo de interfaz.
 */
export function DefinicionesDeTinta() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className={css.oculto}>
      <defs>
        {[1, 2, 3].map((semilla) => (
          <filter
            key={semilla}
            id={`tinta-${semilla}`}
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
          >
            {/* Ruido fino para el borde... */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={1}
              seed={semilla}
              result="fino"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="fino"
              scale={2.4}
              xChannelSelector="R"
              yChannelSelector="G"
              result="borde"
            />
            {/* ...y grueso, con corte brusco, para las pocas manchas sin tinta. */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.2"
              numOctaves={2}
              seed={semilla + 10}
              result="grueso"
            />
            <feColorMatrix
              in="grueso"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -14 11.1"
              result="huecos"
            />
            <feComposite in="borde" in2="huecos" operator="in" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

interface Props {
  progreso: number;
  faltan: number;
  /** El indice del sello recien puesto, que se estampa con movimiento. */
  nuevo: number | null;
}

export function Sellos({ progreso, faltan, nuevo }: Props) {
  const { icono, plantilla } = useApariencia();
  const total = progreso + faltan;
  if (total === 0 || total > MAXIMO_DIBUJABLE) {
    return <p className={css.cuentaDeSellos}>{progreso} sellos</p>;
  }
  return (
    <div
      className={css.sellos}
      data-plantilla={plantilla}
      role="img"
      aria-label={`${progreso} de ${total} sellos`}
    >
      {Array.from({ length: total }, (_, i) =>
        i < progreso ? (
          <Sello key={i} indice={i} nuevo={i === nuevo} icono={icono} />
        ) : (
          <Casilla key={i} indice={i} esElPremio={i === total - 1} />
        ),
      )}
    </div>
  );
}

function Sello(p: { indice: number; nuevo: boolean; icono: IconoDeSello }) {
  const { indice, nuevo } = p;
  const estilo = { '--giro': `${GIROS[indice % GIROS.length] ?? 0}deg` } as CSSProperties;
  return (
    <svg
      className={css.sello}
      viewBox="0 0 64 64"
      style={estilo}
      data-nuevo={nuevo || undefined}
      aria-hidden="true"
      focusable="false"
    >
      <g filter={`url(#tinta-${(indice % 3) + 1})`}>
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
        />
        <circle cx="32" cy="32" r="21.5" fill="currentColor" />
      </g>
      {/*
       * El icono va afuera del filtro: la tinta gasta el borde, pero un dibujo
       * de 24 unidades erosionado deja de leerse. Centrado en el disco.
       */}
      <g
        transform="translate(18.2 18.2) scale(1.15)"
        style={{ color: 'var(--c-sobre-sello)' }}
      >
        {DIBUJO_DE_SELLO[p.icono]}
      </g>
    </svg>
  );
}

function Casilla({ indice, esElPremio }: { indice: number; esElPremio: boolean }) {
  return (
    <span
      className={css.casilla}
      data-premio={esElPremio || undefined}
      aria-hidden="true"
    >
      {esElPremio ? <IconoPremio /> : indice + 1}
    </span>
  );
}

function IconoPremio() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
      <path
        d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Zm-1-4h18v4H3V7Zm9 0v14M12 7c-1.5-3-5-3.5-5-1.2C7 7 9.5 7 12 7Zm0 0c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
