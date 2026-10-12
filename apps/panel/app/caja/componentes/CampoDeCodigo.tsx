import type { Ref } from 'react';
import { Boton } from '../../../diseno';
import css from './CampoDeCodigo.module.css';

interface Props {
  id: string;
  valor: string;
  alCambiar: (valor: string) => void;
  alEnviar: (valor: string) => void;
  /** "Sellar", "Entregar premio": el mismo verbo que usa el aviso de reintento. */
  boton: string;
  botonTrabajando: string;
  /** Esta accion esta viajando. */
  trabajando: boolean;
  /** Hay alguna accion viajando, esta u otra. */
  ocupado: boolean;
  refCampo: Ref<HTMLInputElement>;
}

/**
 * El campo y el boton grande. Enter envia, igual que el boton.
 *
 * El foco nunca sale del campo: el boton no lo toma al tocarlo y el campo no
 * se deshabilita mientras la peticion viaja (pasa a solo lectura). Un campo
 * deshabilitado pierde el foco y en la tablet se cierra el teclado.
 */
export function CampoDeCodigo(p: Props) {
  return (
    <form
      className={css.formulario}
      onSubmit={(e) => {
        e.preventDefault();
        p.alEnviar(p.valor);
      }}
    >
      <label htmlFor={p.id} className={css.etiqueta}>
        Código del cliente
      </label>
      <div className={css.fila}>
        <input
          ref={p.refCampo}
          id={p.id}
          className={css.campo}
          value={p.valor}
          onChange={(e) => p.alCambiar(e.target.value)}
          readOnly={p.ocupado}
          maxLength={40}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="send"
        />
        <Boton
          type="submit"
          tamano="grande"
          disabled={p.ocupado}
          onMouseDown={(e) => e.preventDefault()}
        >
          {p.trabajando ? p.botonTrabajando : p.boton}
        </Boton>
      </div>
    </form>
  );
}
