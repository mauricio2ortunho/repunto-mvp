import type { EstadoDeCaja } from '@repunto/contratos';
import { Boton } from '@repunto/ui';
import type { Conexion } from '../usar-registros';
import css from './Banda.module.css';

const TEXTO_DE_CONEXION: Record<Conexion, string> = {
  conectando: 'Conectando…',
  en_linea: 'Conectada',
  sin_conexion: 'Sin conexión',
};

/**
 * El negocio, arriba de todo y en su color. La superficie 'marca' pinta el
 * fondo con --c-marca y el texto con --c-sobre-marca, que VistaDeCaja define
 * con `variablesDeMarca`: blanco o negro por contraste, nunca elegido.
 */
export function Banda({
  datos,
  conexion,
  cerrando,
  puedeCerrar,
  alCerrarTurno,
}: {
  datos: EstadoDeCaja | null;
  conexion: Conexion;
  cerrando: boolean;
  /** Con una accion en curso no se cierra: el sello que viaja es de este turno. */
  puedeCerrar: boolean;
  alCerrarTurno: () => void;
}) {
  return (
    <header className={css.banda} data-superficie="marca">
      <div className={css.marca}>
        {datos?.negocio.logo_url != null && datos.negocio.logo_url !== '' && (
          <span className={css.logo}>
            {/* El logo sale de la base de cada negocio: no pasa por next/image. */}
            <img
              src={datos.negocio.logo_url}
              alt=""
              onError={(e) => {
                const contenedor = e.currentTarget.parentElement;
                if (contenedor !== null) contenedor.hidden = true;
              }}
            />
          </span>
        )}
        <div>
          <h1 className={css.negocio}>{datos?.negocio.nombre ?? 'Caja'}</h1>
          {datos !== null && <p className={css.local}>{datos.local.nombre}</p>}
        </div>
      </div>
      <div className={css.derecha}>
        {datos?.turno != null && (
          <>
            <span className={css.turno}>Turno de {datos.turno.usuario}</span>
            {/* Un toque: cerrarlo por error solo cuesta volver a escribir el PIN. */}
            <Boton
              variante="texto"
              onClick={alCerrarTurno}
              disabled={cerrando || !puedeCerrar}
            >
              {cerrando ? 'Cerrando…' : 'Cerrar turno'}
            </Boton>
          </>
        )}
        <span className={css.conexion} data-estado={conexion} role="status">
          {TEXTO_DE_CONEXION[conexion]}
        </span>
      </div>
    </header>
  );
}
