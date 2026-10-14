import type { RegistroEnCaja } from '@repunto/contratos';
import { Boton, BotonDeDosToques } from '@repunto/ui';
import { haceCuanto } from '../frases';
import css from './Registros.module.css';

export type QueHaceLaFila = 'sellar' | 'solo' | 'descartar';

interface Props {
  registros: readonly RegistroEnCaja[];
  ahora: number;
  /** Por que ahora no se confirma a nadie, o null si se puede. */
  motivoDeBloqueo: string | null;
  /** Hay alguna accion de la caja viajando. */
  ocupado: boolean;
  filaOcupada: { id: string; que: QueHaceLaFila } | null;
  alConfirmar: (r: RegistroEnCaja, conSello: boolean) => void;
  alDescartar: (r: RegistroEnCaja) => void;
}

/**
 * Los que escanearon el QR y esperan que el cajero los confirme.
 *
 * Nombre y los ultimos cuatro digitos, grandes: con tres personas
 * registrandose a la vez, el cajero pregunta "terminado en 4521?" antes de
 * tocar, y asi no confirma la fila equivocada.
 */
export function Registros(p: Props) {
  return (
    <section className={css.registros} aria-labelledby="titulo-registros">
      <header className={css.cabeza}>
        <h2 id="titulo-registros">Registros nuevos</h2>
        {p.registros.length > 0 && (
          <span className={css.contador} aria-label={`${p.registros.length} esperando`}>
            {p.registros.length}
          </span>
        )}
      </header>

      {p.motivoDeBloqueo !== null && p.registros.length > 0 && (
        <p className={css.nota}>{p.motivoDeBloqueo}</p>
      )}

      {p.registros.length === 0 ? (
        <p className={css.vacio}>
          Cuando alguien escanee el QR del mostrador, aparece acá para que lo confirmes.
        </p>
      ) : (
        <ul className={css.lista}>
          {p.registros.map((r) => (
            <Fila
              key={r.id}
              registro={r}
              ahora={p.ahora}
              inhabilitada={p.motivoDeBloqueo !== null || p.ocupado}
              trabajando={p.filaOcupada?.id === r.id ? p.filaOcupada.que : null}
              alConfirmar={p.alConfirmar}
              alDescartar={p.alDescartar}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Fila(p: {
  registro: RegistroEnCaja;
  ahora: number;
  inhabilitada: boolean;
  trabajando: QueHaceLaFila | null;
  alConfirmar: (r: RegistroEnCaja, conSello: boolean) => void;
  alDescartar: (r: RegistroEnCaja) => void;
}) {
  const r = p.registro;
  return (
    <li className={css.registro} aria-busy={p.trabajando !== null}>
      <div className={css.registroCabeza}>
        <span className={css.nombre}>{r.nombre}</span>
        <span className={css.hace}>{haceCuanto(r.creado_el, p.ahora)}</span>
      </div>
      <p className={css.terminado}>
        <span>terminado en</span>
        <strong>{r.telefono_final}</strong>
      </p>
      <div className={css.acciones}>
        <Boton ancho disabled={p.inhabilitada} onClick={() => p.alConfirmar(r, true)}>
          {p.trabajando === 'sellar' ? 'Confirmando…' : 'Confirmar y sellar'}
        </Boton>
        <Boton
          variante="secundario"
          ancho
          disabled={p.inhabilitada}
          onClick={() => p.alConfirmar(r, false)}
        >
          {p.trabajando === 'solo' ? 'Confirmando…' : 'Solo confirmar'}
        </Boton>
      </div>
      {/* Descartar obliga al cliente a escanear de nuevo: pide un segundo toque. */}
      <BotonDeDosToques
        texto="Descartar"
        confirmar={`Tocá de nuevo para descartar a ${r.nombre}`}
        trabajando={p.trabajando === 'descartar'}
        textoTrabajando="Descartando…"
        disabled={p.inhabilitada}
        alConfirmar={() => p.alDescartar(r)}
      />
    </li>
  );
}
