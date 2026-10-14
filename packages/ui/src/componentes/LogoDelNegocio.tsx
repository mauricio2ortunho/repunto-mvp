'use client';

import { useState } from 'react';

import css from './LogoDelNegocio.module.css';

/**
 * El logo del negocio, o su inicial si todavia no lo entrego (el alta manual
 * suele hacerse antes de tener las imagenes). Va adentro de una superficie de
 * marca: la inicial toma el color del texto calculado, asi que contrasta con
 * cualquier color de negocio.
 *
 * Si la imagen no carga —una URL vieja, sin conexion— tambien cae en la
 * inicial: un cuadro roto en la tarjeta del cliente se ve peor que una letra.
 */
export function LogoDelNegocio(p: { nombre: string; url: string | null }) {
  const [roto, setRoto] = useState(false);

  if (p.url === null || p.url === '' || roto) {
    return (
      <span className={css.inicial} aria-hidden="true">
        {inicialDe(p.nombre)}
      </span>
    );
  }
  return (
    <span className={css.logo}>
      {/* El logo sale de la base de cada negocio: no pasa por un optimizador. */}
      <img src={p.url} alt="" onError={() => setRoto(true)} />
    </span>
  );
}

function inicialDe(nombre: string): string {
  return nombre.trim().charAt(0).toLocaleUpperCase('es') || '·';
}
