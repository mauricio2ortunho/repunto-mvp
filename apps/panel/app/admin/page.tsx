import type { Metadata } from 'next';

import { InicioDeAdmin } from './InicioDeAdmin';

export const metadata: Metadata = { title: 'Administración' };

export default function Pagina() {
  return <InicioDeAdmin />;
}
