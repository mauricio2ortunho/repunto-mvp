'use client';

import '@repunto/ui/estilos';
import { Aviso, Boton } from '@repunto/ui';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Lo que se ve si una pantalla revienta al dibujarse. Reemplaza al layout
 * entero, por eso trae su propio html y los estilos.
 *
 * Recargar y no `reset()`: una tablet que quedo en un estado roto se arregla
 * empezando de cero, y la sesion de la tablet sobrevive a la recarga.
 */
export default function ErrorGrave({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es-BO">
      <body>
        <main>
          <Aviso mensaje="La caja tuvo un problema. Recargá la página; si vuelve a pasar, avisá al dueño." />
          <Boton tamano="grande" onClick={() => window.location.reload()}>
            Recargar
          </Boton>
        </main>
      </body>
    </html>
  );
}
