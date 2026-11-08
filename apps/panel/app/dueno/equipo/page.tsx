import type { Metadata } from 'next';

import { MarcoDelDueno } from '../MarcoDelDueno';
import { EquipoDelDueno } from '../NegocioDelDueno';

export const metadata: Metadata = { title: 'Tu equipo' };

export default function Pagina() {
  return (
    <MarcoDelDueno seccion="equipo">
      <EquipoDelDueno />
    </MarcoDelDueno>
  );
}
