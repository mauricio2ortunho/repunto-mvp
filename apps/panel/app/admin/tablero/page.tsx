import type { Metadata } from 'next';

import { Tablero } from './Tablero';

export const metadata: Metadata = { title: 'Tablero del piloto' };

export default function Pagina() {
  return <Tablero />;
}
