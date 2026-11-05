import type { Metadata } from 'next';

import { CartelDelQr } from './CartelDelQr';

export const metadata: Metadata = { title: 'QR para imprimir' };

export default function Pagina() {
  return <CartelDelQr />;
}
