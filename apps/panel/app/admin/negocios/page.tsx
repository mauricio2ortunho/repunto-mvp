import type { Metadata } from 'next';

import { ListaDeNegocios } from './ListaDeNegocios';

export const metadata: Metadata = { title: 'Negocios' };

export default function Pagina() {
  return <ListaDeNegocios />;
}
