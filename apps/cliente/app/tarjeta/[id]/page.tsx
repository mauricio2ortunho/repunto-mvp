import type { Metadata } from 'next';

import { Detalle } from './Detalle';

export const metadata: Metadata = { title: 'Mi tarjeta' };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Detalle id={decodeURIComponent(id)} />;
}
