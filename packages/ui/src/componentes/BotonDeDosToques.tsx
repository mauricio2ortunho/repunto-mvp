import { useEffect, useState } from 'react';
import { Boton } from './Boton';

/** Pasado esto sin el segundo toque, el boton vuelve a su texto. */
const ESPERA_MS = 4_000;

interface Props {
  texto: string;
  /** Lo que dice despues del primer toque: que va a pasar y a quien. */
  confirmar: string;
  trabajando: boolean;
  textoTrabajando: string;
  disabled: boolean;
  alConfirmar: () => void;
}

/**
 * Para acciones que molestan si salen por error -descartar un registro,
 * deshacer un sello-: el primer toque arma, el segundo hace.
 */
export function BotonDeDosToques(p: Props) {
  const [armado, setArmado] = useState(false);

  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(false), ESPERA_MS);
    return () => clearTimeout(t);
  }, [armado]);

  return (
    <Boton
      variante="texto"
      peligro={armado}
      disabled={p.disabled}
      onClick={() => {
        if (!armado) return setArmado(true);
        setArmado(false);
        p.alConfirmar();
      }}
    >
      {p.trabajando ? p.textoTrabajando : armado ? p.confirmar : p.texto}
    </Boton>
  );
}
