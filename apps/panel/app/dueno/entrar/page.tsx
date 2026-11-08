import type { Metadata } from 'next';

import { Entrar } from './Entrar';

export const metadata: Metadata = { title: 'Entrar a tu negocio' };

export default function Pagina() {
  return <Entrar />;
}
