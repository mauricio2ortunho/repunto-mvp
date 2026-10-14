import type { ButtonHTMLAttributes, Ref } from 'react';
import css from './Boton.module.css';

export type VarianteDeBoton = 'principal' | 'secundario' | 'texto';
export type TamanoDeBoton = 'normal' | 'grande';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** principal: la accion de la pantalla. secundario: la alternativa. texto: lo que se hace poco. */
  variante?: VarianteDeBoton;
  /** grande: el boton de la caja, el que se toca cien veces por dia. */
  tamano?: TamanoDeBoton;
  /** Va a borrar o deshacer algo. */
  peligro?: boolean;
  /** Ocupa todo el ancho de lo que lo contiene. */
  ancho?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * El unico boton. Un boton nuevo es una variante o un tamano nuevo aca, no un
 * estilo suelto en una pantalla: asi cambiar como se ven los botones es
 * cambiar un archivo.
 *
 * Los colores salen de los roles (--c-accion...). Sobre una superficie que los
 * redefine -la de alerta- el boton se adapta solo.
 */
export function Boton({
  variante = 'principal',
  tamano = 'normal',
  peligro = false,
  ancho = false,
  className,
  type = 'button',
  ...resto
}: Props) {
  return (
    <button
      type={type}
      className={className === undefined ? css.boton : `${css.boton} ${className}`}
      data-variante={variante}
      data-tamano={tamano}
      data-peligro={peligro || undefined}
      data-ancho={ancho || undefined}
      {...resto}
    />
  );
}
