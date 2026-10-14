import type { ReactNode } from 'react';

import css from './Pantalla.module.css';

/**
 * La columna de cada pantalla de la app: el ancho de un telefono, centrada si
 * se abre en algo mas grande, y con espacio abajo para la barra del sistema.
 */
export function Pantalla({ children }: { children: ReactNode }) {
  return <main className={css.pantalla}>{children}</main>;
}

/** El nombre de la app, arriba de las pantallas que no son de un negocio. */
export function NombreDeLaApp() {
  return <p className={css.nombre}>Repunto</p>;
}
