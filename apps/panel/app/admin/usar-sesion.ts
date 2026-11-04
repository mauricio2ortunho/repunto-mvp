'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import { sesionDeAdmin } from '../../lib/sesion-de-admin';

/**
 * Toda pantalla de /admin, salvo la entrada: sin sesion guardada manda a
 * /admin/entrar de una, y devuelve `aEntrar` para cuando la api conteste que
 * la sesion ya no sirve.
 */
export function useSesionDeAdmin(): { aEntrar: () => void } {
  const router = useRouter();

  const aEntrar = useCallback(() => {
    sesionDeAdmin().olvidar();
    router.replace('/admin/entrar');
  }, [router]);

  useEffect(() => {
    if (sesionDeAdmin().token() === null) aEntrar();
  }, [aEntrar]);

  return { aEntrar };
}
