import type { Metadata } from 'next';

import { CartelDelAdmin } from './CartelDelQr';

export const metadata: Metadata = { title: 'QR para imprimir' };

export default function Pagina() {
  return <CartelDelAdmin />;
}
