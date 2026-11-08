import type { Metadata } from 'next';

import { MarcoDelDueno } from '../MarcoDelDueno';
import { PromoDelDueno } from './PromoDelDueno';

export const metadata: Metadata = { title: 'Tu promo' };

export default function Pagina() {
  return (
    <MarcoDelDueno seccion="promo">
      <PromoDelDueno />
    </MarcoDelDueno>
  );
}
