import type { ReactElement } from 'react';
import type { IconoDeSello } from '@repunto/contratos';

/**
 * El dibujo de cada icono de sello, en una caja de 24 x 24, en currentColor.
 *
 * La lista de iconos no se repite aca: vive en contratos (y un test la compara
 * con el CHECK de la base). Este mapa es un `Record<IconoDeSello, ...>`, asi
 * que el dia que contratos agregue un icono el panel no compila hasta que
 * alguien lo dibuje. Un valor que llega de la API y esta app no conoce no
 * llega hasta aca: `iconoDeSelloDe` ya lo cambio por el de por defecto.
 *
 * PROVISIONALES, como la lista: los reemplaza el trabajo de diseno.
 */
export const DIBUJO_DE_SELLO: Record<IconoDeSello, ReactElement> = {
  cafe: (
    <g>
      <path
        d="M4 9.5h12v4.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 14Z"
        fill="currentColor"
      />
      <path
        d="M16 11h1.6a2.6 2.6 0 0 1 0 5.2H15.6M8 3.5v3M12 3.5v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </g>
  ),
  estrella: (
    <polygon
      points="12,2.4 14.53,9.12 21.7,9.45 16.09,13.93 18,20.85 12,16.9 6,20.85 7.91,13.93 2.3,9.45 9.47,9.12"
      fill="currentColor"
      strokeLinejoin="round"
    />
  ),
  corazon: (
    <path
      d="M12 21s-7.6-4.7-9.6-9.3C1 8.5 3 4.5 6.9 4.5c2.2 0 3.8 1.2 5.1 3 1.3-1.8 2.9-3 5.1-3 3.9 0 5.9 4 4.5 7.2C19.6 16.3 12 21 12 21Z"
      fill="currentColor"
    />
  ),
  huella: (
    <g fill="currentColor">
      <ellipse cx="12" cy="16" rx="5.2" ry="4.4" />
      <ellipse cx="4.8" cy="10.2" rx="2" ry="2.5" transform="rotate(-20 4.8 10.2)" />
      <ellipse cx="9.2" cy="5.8" rx="2.1" ry="2.7" transform="rotate(-8 9.2 5.8)" />
      <ellipse cx="14.8" cy="5.8" rx="2.1" ry="2.7" transform="rotate(8 14.8 5.8)" />
      <ellipse cx="19.2" cy="10.2" rx="2" ry="2.5" transform="rotate(20 19.2 10.2)" />
    </g>
  ),
};
