import { redirect } from 'next/navigation';

// Por ahora el panel es solo la caja. Esta pagina era un andamio para probar
// que `@repunto/contratos` compilaba dentro de Next; eso ya lo prueba la caja
// entera. Cuando exista el panel del dueño, la raiz va a ser suya.
export default function Pagina(): never {
  redirect('/caja');
}
