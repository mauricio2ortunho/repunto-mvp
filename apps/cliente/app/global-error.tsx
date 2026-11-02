'use client';

import '@repunto/ui/estilos';
import { Aviso, Boton } from '@repunto/ui';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Lo que se ve si una pantalla revienta al dibujarse. Reemplaza al layout
 * entero, por eso trae su propio html y los estilos.
 *
 * Recargar y no `reset()`: empezar de cero arregla un estado roto, y la
 * sesion del telefono sobrevive a la recarga.
 */
export default function ErrorGrave({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es-BO">
      <body>
        <main>
          <Aviso mensaje="Algo no anduvo. Recargá la página para seguir." />
          <Boton tamano="grande" onClick={() => window.location.reload()}>
            Recargar
          </Boton>
        </main>
      </body>
    </html>
  );
}
