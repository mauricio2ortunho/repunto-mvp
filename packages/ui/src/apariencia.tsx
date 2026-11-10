'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  ICONO_DE_SELLO_POR_DEFECTO,
  PLANTILLA_DE_TARJETA_POR_DEFECTO,
  plantillaDeTarjetaDe,
  selloQueSeDibuja,
  type PlantillaDeTarjeta,
  type SelloQueSeDibuja,
} from '@repunto/contratos';

/**
 * Como se ve la tarjeta de este negocio: el icono de los sellos y la
 * plantilla. Se define una vez arriba y la lee cada `Sellos` de adentro, sin
 * pasarlo de componente en componente.
 *
 * Los valores llegan de la API como texto suelto y pasan por
 * `selloQueSeDibuja` y `plantillaDeTarjetaDe` de contratos: uno que esta app
 * todavia no conoce se dibuja con el de por defecto en vez de romper la caja,
 * y el sello con logo sin logo, tambien.
 */
export interface Apariencia {
  sello: SelloQueSeDibuja;
  plantilla: PlantillaDeTarjeta;
}

const PorDefecto: Apariencia = {
  sello: { tipo: 'icono', icono: ICONO_DE_SELLO_POR_DEFECTO },
  plantilla: PLANTILLA_DE_TARJETA_POR_DEFECTO,
};

const Contexto = createContext<Apariencia>(PorDefecto);

export function AparienciaDeTarjeta(p: {
  /** `negocio.icono_sello` tal como vino, o null si todavia no llego. */
  icono: string | null | undefined;
  /** `negocio.plantilla_tarjeta` tal como vino. */
  plantilla: string | null | undefined;
  /**
   * `negocio.logo_url`: el sello lo estampa si el ícono es `logo`. Obligatorio
   * aunque sea null, para que ninguna pantalla se olvide de pasarlo.
   */
  logo: string | null | undefined;
  children: ReactNode;
}) {
  const valor = useMemo<Apariencia>(
    () => ({
      sello: selloQueSeDibuja(p.icono, p.logo),
      plantilla:
        p.plantilla == null ? PorDefecto.plantilla : plantillaDeTarjetaDe(p.plantilla),
    }),
    [p.icono, p.logo, p.plantilla],
  );
  return <Contexto value={valor}>{p.children}</Contexto>;
}

export function useApariencia(): Apariencia {
  return useContext(Contexto);
}
