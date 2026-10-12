import { Boton } from '../../../diseno';
import type { Bloqueo as DatosDelBloqueo } from '../bloqueo';
import css from './Bloqueo.module.css';

interface Props {
  bloqueo: DatosDelBloqueo;
  revisando: boolean;
  alRevisar: () => void;
}

/**
 * La caja no puede operar. El texto es siempre el de la API o el de
 * `mensajeParaElCajero`: dice que hacer. Lo que cambia es el tono (bloqueo.ts).
 */
export function Bloqueo({ bloqueo, revisando, alRevisar }: Props) {
  const revisar = (
    <Boton tamano="grande" onClick={alRevisar} disabled={revisando}>
      {revisando ? 'Revisando…' : 'Volver a revisar'}
    </Boton>
  );

  if (bloqueo.tono === 'instruccion') {
    // Lo de todas las mananas: la misma tarjeta que el resto, sin color.
    // Cuando exista el endpoint de abrir turno, el nombre y el PIN van aca,
    // como accion principal, y "Volver a revisar" pasa a secundario.
    // POST /caja/turnos NO lleva Idempotency-Key: no pasarlo por `correr` de
    // useCaja, que la genera siempre y guarda en memoria una firma con el PIN.
    return (
      <section className={css.tarjeta} role="status" aria-labelledby="titulo-bloqueo">
        <h2 id="titulo-bloqueo" className={css.instruccion}>
          {bloqueo.mensaje}
        </h2>
        {revisar}
      </section>
    );
  }

  // Nadie en el mostrador lo resuelve: va sobre la superficie 'alerta'.
  return (
    <section className={css.alarma} role="alert" aria-labelledby="titulo-bloqueo">
      <p className={css.alarmaTitulo}>La caja no puede sellar ahora</p>
      <h2 id="titulo-bloqueo" className={css.alarmaMensaje}>
        {bloqueo.mensaje}
      </h2>
      {revisar}
    </section>
  );
}
