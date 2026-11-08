import type { Metadata } from 'next';

import { InicioDelDueno } from './InicioDelDueno';

export const metadata: Metadata = { title: 'Tu negocio' };

export default function Pagina() {
  return <InicioDelDueno />;
}
