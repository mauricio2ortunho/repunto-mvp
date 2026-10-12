import type { EstadoDeCaja } from '@repunto/contratos';
import { esMontoCero, formatearBolivianos } from '../frases';
import css from './Condicion.module.css';

/**
 * Lo que el cajero mira antes de sellar: cuando corresponde un sello. Sin
 * monto minimo (null o cero) se muestra solo el texto.
 */
export function Condicion({ condicion }: { condicion: EstadoDeCaja['condicion'] }) {
  if (condicion === null) return null;
  const monto = condicion.monto_minimo;
  return (
    <section className={css.condicion} aria-label="Condición para sellar">
      <p className={css.texto}>{condicion.texto}</p>
      {monto !== null && !esMontoCero(monto) && (
        <p className={css.monto}>
          Compra mínima <strong>{formatearBolivianos(monto)}</strong>
        </p>
      )}
    </section>
  );
}
