import type { Metadata } from 'next';

import { filtroDesde } from '../../../lib/clientes-del-dueno';
import { MarcoDelDueno } from '../MarcoDelDueno';
import { ClientesDelDueno } from './ClientesDelDueno';

export const metadata: Metadata = { title: 'Tus clientes' };

/** `?ver=enfriados`: el enlace "Ver quiénes" del resumen abre con ese filtro. */
export default async function Pagina(p: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await p.searchParams;
  return (
    <MarcoDelDueno seccion="clientes">
      <ClientesDelDueno filtroInicial={filtroDesde(ver)} />
    </MarcoDelDueno>
  );
}
