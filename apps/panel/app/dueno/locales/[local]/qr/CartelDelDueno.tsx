'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import * as api from '../../../../../lib/api/dueno';
import {
  CartelDelQr,
  type FuenteDelCartel,
} from '../../../../admin/negocios/[id]/locales/[local]/qr/CartelDelQr';
import { useSesionDeDueno } from '../../../usar-sesion';

/** El cartel del QR desde el panel del dueño: /dueno/locales/:local/qr. */
export function CartelDelDueno() {
  const { local } = useParams<{ local: string }>();
  const { aEntrar } = useSesionDeDueno();
  const fuente = useMemo<FuenteDelCartel>(
    () => ({
      cargar: (senal) => api.negocio(senal),
      cambiarQr: (elLocal) => api.cambiarQr(elLocal),
      fallo: (f) => {
        if (!api.sesionPerdida(f)) return api.mensajeParaElDueno(f);
        aEntrar();
        return null;
      },
      volver: { href: '/dueno/locales', texto: 'Volver a tus locales' },
    }),
    [aEntrar],
  );
  return <CartelDelQr localId={local} fuente={fuente} />;
}
