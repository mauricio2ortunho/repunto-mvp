import type { ReactNode } from 'react';

export const metadata = {
  title: 'Repunto — cliente',
  description: 'Tus tarjetas de sellos.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
