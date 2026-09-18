import type { ReactNode } from 'react';

export const metadata = {
  title: 'Repunto — panel',
  description: 'Panel de caja, supervisor, dueno y administracion.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
