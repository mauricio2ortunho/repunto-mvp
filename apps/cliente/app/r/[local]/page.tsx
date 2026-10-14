import type { Metadata } from 'next';

import { Registro } from './Registro';

export const metadata: Metadata = { title: 'Registrarme' };

/**
 * `/r/<qr>`: a donde lleva el QR impreso en el mostrador. El segmento es el
 * `qr_slug` del local, que es publico: esta impreso.
 */
export default async function Pagina({ params }: { params: Promise<{ local: string }> }) {
  const { local } = await params;
  return <Registro qr={decodeURIComponent(local)} />;
}
