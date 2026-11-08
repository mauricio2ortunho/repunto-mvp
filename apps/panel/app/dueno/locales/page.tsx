import type { Metadata } from 'next';

import { MarcoDelDueno } from '../MarcoDelDueno';
import { LocalesDelDueno } from '../NegocioDelDueno';

export const metadata: Metadata = { title: 'Tus locales' };

export default function Pagina() {
  return (
    <MarcoDelDueno seccion="locales">
      <LocalesDelDueno />
    </MarcoDelDueno>
  );
}
