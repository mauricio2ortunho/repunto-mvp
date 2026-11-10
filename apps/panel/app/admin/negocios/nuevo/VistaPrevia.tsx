'use client';

import {
  AparienciaDeTarjeta,
  DefinicionesDeTinta,
  LogoDelNegocio,
  Sellos,
  variablesDeMarca,
} from '@repunto/ui';

import { LIMITES_DEL_NEGOCIO } from '@repunto/contratos';

import type { Borrador } from '../../../../lib/alta-de-negocio';
import estilos from '../Negocios.module.css';

/**
 * La tarjeta como la va a ver el cliente, mientras se llena el formulario.
 * Usa las mismas piezas de @repunto/ui que la app: si el color o el icono se
 * ven mal aca, se ven mal en el telefono.
 *
 * Muestra unos sellos ya puestos para que se vea el icono; el logo, hasta
 * que exista la subida, es la inicial.
 */
export function VistaPrevia({
  borrador: b,
  logoUrl = null,
}: {
  borrador: Borrador;
  /** El logo ya subido; en el alta todavía no hay. */
  logoUrl?: string | null;
}) {
  const total = sellosParaDibujar(b.sellos);
  const puestos = Math.min(3, total - 1);
  const nombre = b.nombre.trim() === '' ? 'Tu negocio' : b.nombre.trim();
  const premio = b.premio.trim() === '' ? 'El premio' : b.premio.trim();

  return (
    <figure className={estilos.previa}>
      <DefinicionesDeTinta />
      <figcaption className={estilos.leyenda}>Así la ve el cliente</figcaption>
      <div className={estilos.tarjeta}>
        <header
          className={estilos.cabecera}
          data-superficie="marca"
          style={variablesDeMarca(b.color)}
        >
          <LogoDelNegocio nombre={nombre} url={logoUrl} />
          <h2>{nombre}</h2>
        </header>
        <div className={estilos.cuerpo}>
          <AparienciaDeTarjeta icono={b.icono} plantilla={b.plantilla} logo={logoUrl}>
            <Sellos progreso={puestos} faltan={total - puestos} nuevo={null} />
          </AparienciaDeTarjeta>
          <p className={estilos.faltan}>Te faltan {total - puestos} para tu premio</p>
          <p className={estilos.detalle}>Premio: {premio}</p>
        </div>
      </div>
    </figure>
  );
}

/** Lo que haya escrito, dentro de lo que se puede dibujar. */
function sellosParaDibujar(texto: string): number {
  const { minimo, maximo } = LIMITES_DEL_NEGOCIO.sellosRequeridos;
  const n = Number.parseInt(texto, 10);
  if (Number.isNaN(n)) return 10;
  return Math.min(Math.max(n, Math.max(minimo, 2)), maximo);
}
