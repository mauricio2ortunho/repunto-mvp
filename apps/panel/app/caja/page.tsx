import type { Metadata } from 'next';
import { VistaDeCaja } from './componentes/VistaDeCaja';

export const metadata: Metadata = { title: 'Caja' };

export default function PaginaDeCaja() {
  return <VistaDeCaja />;
}
