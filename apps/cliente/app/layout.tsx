import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@repunto/ui/estilos';

export const metadata: Metadata = {
  title: { default: 'Repunto', template: '%s | Repunto' },
  description: 'Tus tarjetas de sellos, en el teléfono.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El codigo se muestra en caja: que el telefono no lo achique con zoom.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-BO">
      <body>{children}</body>
    </html>
  );
}
