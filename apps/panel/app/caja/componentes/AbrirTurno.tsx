import type { EstadoDeCaja } from '@repunto/contratos';
import { Aviso, Boton, TecladoDePin } from '@repunto/ui';
import { LARGO_DEL_PIN } from '../apertura';
import { useApertura } from '../usar-apertura';
import css from './AbrirTurno.module.css';

const ROL: Record<'dueno' | 'supervisor' | 'cajero', string> = {
  dueno: 'Dueño',
  supervisor: 'Supervisor',
  cajero: 'Cajero',
};

/**
 * Lo de todas las mananas: el cajero toca su nombre y escribe su PIN. Va
 * neutro, como cualquier tarjeta de la caja (ver bloqueo.ts): pintarlo de
 * rojo a diario entrena al equipo a ignorar el rojo.
 */
export function AbrirTurno({ alAbrir }: { alAbrir: (estado: EstadoDeCaja) => void }) {
  const a = useApertura({ alAbrir });
  const { estado } = a;

  if (estado.paso === 'pin') {
    return (
      <section className={css.tarjeta} aria-labelledby="titulo-pin">
        <h2 id="titulo-pin" className={css.titulo}>
          Hola, {estado.usuario.nombre}. Escribí tu PIN.
        </h2>
        {estado.aviso !== null && <Aviso mensaje={estado.aviso} />}
        <TecladoDePin
          valor={estado.pin}
          largo={LARGO_DEL_PIN}
          alCambiar={a.teclear}
          deshabilitado={estado.enviando}
          etiqueta={`PIN de ${estado.usuario.nombre}`}
        />
        <p className={css.estado} aria-live="polite">
          {estado.enviando ? 'Abriendo turno…' : ''}
        </p>
        <Boton variante="texto" onClick={a.volver} disabled={estado.enviando}>
          No soy {estado.usuario.nombre}
        </Boton>
      </section>
    );
  }

  return (
    <section className={css.tarjeta} aria-labelledby="titulo-lista">
      <h2 id="titulo-lista" className={css.titulo}>
        ¿Quién atiende? Tocá tu nombre.
      </h2>
      {estado.aviso !== null && <Aviso mensaje={estado.aviso} />}
      {a.problemaDeLista !== null ? (
        <>
          <Aviso mensaje={a.problemaDeLista} />
          <Boton variante="secundario" onClick={() => void a.recargar()}>
            Volver a intentar
          </Boton>
        </>
      ) : a.usuarios === null ? (
        <p className={css.estado}>Cargando…</p>
      ) : a.usuarios.length === 0 ? (
        <p className={css.vacio}>
          Nadie de este local tiene PIN todavía. Avisá al dueño para que lo cargue.
        </p>
      ) : (
        <ul className={css.lista}>
          {a.usuarios.map((u) => (
            <li key={u.id}>
              <button type="button" className={css.persona} onClick={() => a.elegir(u)}>
                <span className={css.nombre}>{u.nombre}</span>
                <span className={css.rol}>{ROL[u.rol]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
