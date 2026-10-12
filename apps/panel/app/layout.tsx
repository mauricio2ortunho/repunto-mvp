import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/atkinson-hyperlegible-mono';
import '../diseno/tokens.css';
import '../diseno/base.css';

export const metadata: Metadata = {
  title: { default: 'Repunto', template: '%s | Repunto' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-BO">
      <body>{children}</body>
    </html>
  );
}
