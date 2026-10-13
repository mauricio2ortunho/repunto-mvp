import type { ReactNode } from 'react';
import type { EstadoDeCaja } from '@repunto/contratos';
import { Aviso, BotonDeDosToques, Sellos } from '../../../diseno';
import type { Ultimo } from '../estado';
import {
  fraseDeAnulacion,
  fraseDelAlta,
  fraseDelCanje,
  fraseDelSello,
  primerNombre,
} from '../frases';
import { Frase } from './Frase';
import css from './Resultado.module.css';

interface Props {
  ultimo: Ultimo;
  /** Para dibujar la tarjeta en blanco antes del primer sello. */
  programa: EstadoDeCaja['programa'];
  ocupado: boolean;
  deshaciendo: boolean;
  alDeshacer: (selloId: string) => void;
}

const INVITACION = 'Tipeá el código que el cliente tiene en la app y tocá Sellar.';

/** El area grande debajo del campo: lo que acaba de pasar con este cliente. */
export function Resultado(p: Props) {
  const { ultimo } = p;
  const deshacer = (selloId: string | null, nombre: string) =>
    selloId === null ? null : (
      <BotonDeDosToques
        texto="Deshacer sello"
        confirmar={`Tocá de nuevo para deshacer el sello de ${primerNombre(nombre) || 'este cliente'}`}
        trabajando={p.deshaciendo}
        textoTrabajando="Deshaciendo…"
        disabled={p.ocupado}
        alConfirmar={() => p.alDeshacer(selloId)}
      />
    );

  switch (ultimo.tipo) {
    case 'nada':
      if (p.ocupado) return null;
      return p.programa === null ? (
        <p className={css.invitacion}>{INVITACION}</p>
      ) : (
        <article className={css.tarjeta} data-en-blanco>
          <p className={css.invitacion}>{INVITACION}</p>
          <Sellos progreso={0} faltan={p.programa.sellos_requeridos} nuevo={null} />
          <Premio premio={p.programa.premio} />
        </article>
      );

    case 'aviso':
      return <Aviso mensaje={ultimo.mensaje} />;

    case 'sello': {
      const d = ultimo.datos;
      return (
        <Tarjeta hecho="Sellado" nombre={d.nombre} pie={deshacer(d.sello_id, d.nombre)}>
          <Sellos progreso={d.progreso} faltan={d.faltan} nuevo={d.progreso - 1} />
          <Frase texto={fraseDelSello(d)} />
          <Premio premio={d.premio} />
        </Tarjeta>
      );
    }

    case 'alta': {
      const d = ultimo.datos;
      return (
        <Tarjeta
          hecho={d.sello ? 'Registrado y sellado' : 'Registrado'}
          nombre={d.nombre}
          pie={deshacer(d.sello_id, d.nombre)}
        >
          <Sellos
            progreso={d.progreso}
            faltan={d.faltan}
            nuevo={d.sello ? d.progreso - 1 : null}
          />
          <Frase texto={fraseDelAlta(d)} />
          <Premio premio={d.premio} />
        </Tarjeta>
      );
    }

    case 'canje': {
      const d = ultimo.datos;
      return (
        <Tarjeta hecho="Premio entregado" nombre={d.nombre}>
          <Frase texto={fraseDelCanje(d)} />
          <Premio premio={d.premio} />
        </Tarjeta>
      );
    }

    case 'anulado': {
      const d = ultimo.datos;
      return (
        <Tarjeta hecho="Sello deshecho" nombre={d.nombre} tono="neutro">
          <Sellos progreso={d.progreso} faltan={d.faltan} nuevo={null} />
          <p className={css.nota}>{fraseDeAnulacion(d)}</p>
        </Tarjeta>
      );
    }
  }
}

function Tarjeta(p: {
  hecho: string;
  nombre: string;
  tono?: 'neutro';
  pie?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={css.tarjeta}>
      <header className={css.cabeza}>
        <h2 className={css.nombre}>{p.nombre}</h2>
        <span className={css.hecho} data-tono={p.tono}>
          {p.hecho}
        </span>
      </header>
      {p.children}
      {p.pie}
    </article>
  );
}

function Premio({ premio }: { premio: string }) {
  return (
    <p className={css.premio}>
      Premio: <strong>{premio}</strong>
    </p>
  );
}
