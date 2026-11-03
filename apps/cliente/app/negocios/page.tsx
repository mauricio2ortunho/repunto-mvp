import type { Metadata } from 'next';

import { Directorio } from './Directorio';

export const metadata: Metadata = { title: 'Dónde juntar sellos' };

export default function Pagina() {
  return <Directorio />;
}
