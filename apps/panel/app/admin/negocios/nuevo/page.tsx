import type { Metadata } from 'next';

import { NuevoNegocio } from './NuevoNegocio';

export const metadata: Metadata = { title: 'Nuevo negocio' };

export default function Pagina() {
  return <NuevoNegocio />;
}
