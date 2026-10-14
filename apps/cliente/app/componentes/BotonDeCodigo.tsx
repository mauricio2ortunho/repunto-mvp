'use client';

import { useRouter } from 'next/navigation';
import { Boton } from '@repunto/ui';

import css from './BotonDeCodigo.module.css';

/**
 * Lo que el cliente hace en caja: mostrar su codigo. Queda abajo, a mano, en
 * la lista y en el detalle.
 */
export function BotonDeCodigo() {
  const router = useRouter();
  return (
    <div className={css.pie}>
      <Boton tamano="grande" ancho onClick={() => router.push('/codigo')}>
        Mostrar mi código
      </Boton>
    </div>
  );
}
