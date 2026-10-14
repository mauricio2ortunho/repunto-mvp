import type { Metadata } from 'next';

import { Codigo } from './Codigo';

export const metadata: Metadata = { title: 'Mi código' };

export default function Pagina() {
  return <Codigo />;
}
