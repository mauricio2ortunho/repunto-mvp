import type { Metadata } from 'next';
import { Vincular } from './Vincular';

export const metadata: Metadata = { title: 'Vincular tablet' };

export default function PaginaDeVincular() {
  return <Vincular />;
}
