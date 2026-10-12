import type { Ref } from 'react';
import { Aviso, Boton, BotonDeDosToques, Sellos } from '../../../diseno';
import type { TarjetaCompleta } from '../estado';
import { fraseDeTarjetaCompleta, primerNombre } from '../frases';
import { CampoDeCodigo } from './CampoDeCodigo';
import { Frase } from './Frase';
import css from './Canje.module.css';

interface Props {
  tarjeta: TarjetaCompleta | null;
  contexto: string | null;
  aviso: string | null;
  codigo: string;
  trabajando: boolean;
  ocupado: boolean;
  refCampo: Ref<HTMLInputElement>;
  alCambiar: (codigo: string) => void;
  alEntregar: (codigo: string) => void;
  alVolver: () => void;
  deshaciendo: boolean;
  alDeshacer: (selloId: string) => void;
}

/**
 * La tarjeta se completo: cambia la vista entera, no un numero. Sale el campo
 * de sellar y entra la tarjeta llena, el premio y el pedido del codigo. El
 * fondo sigue siendo el de la caja: lo que marca el momento es la franja y la
 * insignia, sin texto sobre color saturado.
 *
 * Lo mas visible es el pedido del codigo. El sello que completo la tarjeta
 * consumio el codigo que el cliente mostro; si la pantalla no lo dice con
 * todas las letras, el cajero cree que algo fallo y vuelve a tipear el viejo.
 */
export function Canje(p: Props) {
  const { tarjeta } = p;
  const selloId = tarjeta?.sello_id ?? null;
  return (
    <section className={css.canje} aria-labelledby="titulo-canje">
      <article className={css.tarjeta}>
        <header className={css.cabeza}>
          <h2 id="titulo-canje" className={css.titulo}>
            {tarjeta !== null
              ? `${tarjeta.nombre} completó la tarjeta`
              : (p.contexto ?? 'Tiene el premio listo')}
          </h2>
          <p className={css.insignia}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
              <path
                d="M4.5 10.5l3.5 3.5 7.5-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Tarjeta completa
          </p>
        </header>

        {tarjeta !== null && (
          <>
            <Sellos progreso={tarjeta.progreso} faltan={tarjeta.faltan} nuevo={tarjeta.progreso - 1} />
            <Frase texto={fraseDeTarjetaCompleta(tarjeta.nombre)} />
            <p className={css.premio}>
              <span>Premio</span>
              <strong>{tarjeta.premio}</strong>
            </p>
          </>
        )}
      </article>

      <div className={css.instruccion}>
        <p className={css.instruccionPrincipal}>
          Pedile el código de nuevo para entregarle el premio.
        </p>
        {tarjeta !== null && (
          <p className={css.instruccionPorQue}>
            El que usaste recién se gastó en este sello y ya no sirve.
          </p>
        )}
      </div>

      <CampoDeCodigo
        id="codigo-canje"
        valor={p.codigo}
        alCambiar={p.alCambiar}
        alEnviar={p.alEntregar}
        boton="Entregar premio"
        botonTrabajando="Entregando…"
        trabajando={p.trabajando}
        ocupado={p.ocupado}
        refCampo={p.refCampo}
      />

      {p.aviso !== null && <Aviso mensaje={p.aviso} />}

      <div className={css.salidas}>
        <Boton variante="texto" onClick={p.alVolver} disabled={p.ocupado}>
          Volver sin entregar
        </Boton>
        {/* Si el sello que la completo fue para otro cliente, no hay premio. */}
        {tarjeta !== null && selloId !== null && (
          <BotonDeDosToques
            texto="Deshacer sello"
            confirmar={`Tocá de nuevo para deshacer el sello de ${primerNombre(tarjeta.nombre) || 'este cliente'}`}
            trabajando={p.deshaciendo}
            textoTrabajando="Deshaciendo…"
            disabled={p.ocupado}
            alConfirmar={() => p.alDeshacer(selloId)}
          />
        )}
      </div>
    </section>
  );
}
