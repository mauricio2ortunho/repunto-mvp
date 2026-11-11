import type { Metadata } from 'next';

import { SumarNegocio } from './SumarNegocio';

export const metadata: Metadata = { title: 'Sumá tu negocio' };

export default function Pagina() {
  return <SumarNegocio />;
}
