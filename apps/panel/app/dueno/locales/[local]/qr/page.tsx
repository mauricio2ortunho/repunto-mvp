import type { Metadata } from 'next';

import { CartelDelDueno } from './CartelDelDueno';

export const metadata: Metadata = { title: 'QR para imprimir' };

export default function Pagina() {
  return <CartelDelDueno />;
}
