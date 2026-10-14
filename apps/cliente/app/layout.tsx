import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@repunto/ui/estilos';

import { ServiceWorker } from './componentes/ServiceWorker';

export const metadata: Metadata = {
  title: { default: 'Repunto', template: '%s | Repunto' },
  description: 'Tus tarjetas de sellos, en el teléfono.',
  // Para "Agregar a pantalla de inicio": la app abre sola, sin la barra del navegador.
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Repunto', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-BO">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
