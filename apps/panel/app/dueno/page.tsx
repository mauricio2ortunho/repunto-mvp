import type { Metadata } from 'next';

import { MarcoDelDueno } from './MarcoDelDueno';
import { Resumen } from './Resumen';

export const metadata: Metadata = { title: 'Tu negocio' };

export default function Pagina() {
  return (
    <MarcoDelDueno seccion="resumen">
      <Resumen />
    </MarcoDelDueno>
  );
}
