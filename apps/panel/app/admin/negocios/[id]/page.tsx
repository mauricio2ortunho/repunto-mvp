import type { Metadata } from 'next';

import { Ficha } from './Ficha';

export const metadata: Metadata = { title: 'Negocio' };

export default function Pagina() {
  return <Ficha />;
}
