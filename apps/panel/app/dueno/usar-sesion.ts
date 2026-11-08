'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { sesionDeDueno } from '../../lib/sesion-de-dueno';

/**
 * Toda pantalla de /dueno, salvo la entrada: sin sesión guardada manda a
 * /dueno/entrar de una, y devuelve `aEntrar` para cuando la api conteste que
 * la sesión ya no sirve.
 */
export function useSesionDeDueno(): { aEntrar: () => void } {
  const router = useRouter();

  const aEntrar = useCallback(() => {
    sesionDeDueno().olvidar();
    router.replace('/dueno/entrar');
  }, [router]);

  useEffect(() => {
    if (sesionDeDueno().token() === null) aEntrar();
  }, [aEntrar]);

  return { aEntrar };
}
