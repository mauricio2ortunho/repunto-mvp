import type { Metadata } from 'next';

import { ListaDeSolicitudes } from './ListaDeSolicitudes';

export const metadata: Metadata = { title: 'Solicitudes' };

export default function Pagina() {
  return <ListaDeSolicitudes />;
}
