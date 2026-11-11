import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NuevoNegocio } from './NuevoNegocio';

export const metadata: Metadata = { title: 'Nuevo negocio' };

/**
 * Suspense porque el alta lee `?solicitud=` con useSearchParams: sin él,
 * Next no puede armar la página de antemano y el build falla.
 */
export default function Pagina() {
  return (
    <Suspense>
      <NuevoNegocio />
    </Suspense>
  );
}
