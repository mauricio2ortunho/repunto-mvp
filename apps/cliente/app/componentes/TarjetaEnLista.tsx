'use client';

import Link from 'next/link';
import type { TarjetaDelCliente } from '@repunto/contratos';
import {
  AparienciaDeTarjeta,
  LogoDelNegocio,
  Sellos,
  variablesDeMarca,
} from '@repunto/ui';

import { tituloDeEstado, vencimientoDe } from '../../lib/frases';
import css from './TarjetaEnLista.module.css';

/**
 * Una tarjeta en la lista del cliente. Arriba, el negocio en su color —con el
 * texto calculado por contraste—; abajo, los sellos sobre blanco, que se leen
 * igual con cualquier color de marca.
 */
export function TarjetaEnLista(p: { tarjeta: TarjetaDelCliente; ahora: number }) {
  const { tarjeta } = p;
  const vence = vencimientoDe(tarjeta, p.ahora);
  return (
    <Link
      href={`/tarjeta/${tarjeta.id}`}
      className={css.tarjeta}
      data-estado={tarjeta.estado}
    >
      <header
        className={css.marca}
        data-superficie="marca"
        style={variablesDeMarca(tarjeta.negocio.color_principal)}
      >
        <LogoDelNegocio nombre={tarjeta.negocio.nombre} url={tarjeta.negocio.logo_url} />
        <h2>{tarjeta.negocio.nombre}</h2>
      </header>

      <div className={css.cuerpo}>
        <AparienciaDeTarjeta
          icono={tarjeta.negocio.icono_sello}
          plantilla={tarjeta.negocio.plantilla_tarjeta}
        >
          <Sellos progreso={tarjeta.progreso} faltan={tarjeta.faltan} nuevo={null} />
        </AparienciaDeTarjeta>
        <p className={css.titulo}>{tituloDeEstado(tarjeta)}</p>
        <p className={css.premio}>Premio: {tarjeta.premio}</p>
        {vence !== null && <p className={css.vence}>{vence}</p>}
      </div>
    </Link>
  );
}
