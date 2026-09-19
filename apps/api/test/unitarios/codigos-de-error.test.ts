import { describe, expect, it } from 'vitest';

import {
  CODIGOS_DE_ERROR_DE_API,
  CODIGOS_DE_ERROR_DE_CAJA,
  mensajeParaElCajero,
} from '@repunto/contratos';
import { CODIGOS_DE_ERROR } from '@repunto/dominio';

/**
 * La lista de codigos vive dos veces: en `dominio`, que es quien la decide, y
 * en `contratos`, que es lo unico que pueden importar los frontends. No es un
 * descuido: `contratos` no puede importar `dominio` sin romper la regla de
 * dependencias (CLAUDE.md, seccion 3).
 *
 * `apps/api` es el unico paquete que ve los dos, asi que la guardia vive aca.
 * Si alguien agrega un codigo de un lado y se olvida del otro, falla esto.
 */
describe('las dos listas de codigos de error', () => {
  it('son la misma, en el mismo orden', () => {
    expect([...CODIGOS_DE_ERROR_DE_CAJA]).toEqual([...CODIGOS_DE_ERROR]);
  });

  it('cada codigo tiene su mensaje para el cajero', () => {
    for (const codigo of [...CODIGOS_DE_ERROR_DE_CAJA, ...CODIGOS_DE_ERROR_DE_API]) {
      expect(mensajeParaElCajero(codigo).length, codigo).toBeGreaterThan(10);
    }
  });

  it('ningun mensaje nombra cosas de adentro', () => {
    const adentro = /tabla|constraint|transacc|INV-|null|undefined|SQL|token_hash/i;
    for (const codigo of [...CODIGOS_DE_ERROR_DE_CAJA, ...CODIGOS_DE_ERROR_DE_API]) {
      expect(mensajeParaElCajero(codigo), codigo).not.toMatch(adentro);
    }
  });
});

describe('mensajeParaElCajero', () => {
  it('dice a que hora puede volver a sellar, si se lo dan', () => {
    expect(mensajeParaElCajero('DEMASIADO_PRONTO', { hora: '14:30' })).toContain(
      'a las 14:30',
    );
  });

  it('sin la hora, no inventa una', () => {
    expect(mensajeParaElCajero('DEMASIADO_PRONTO')).not.toMatch(/\d\d:\d\d/);
  });

  it('nombra la sucursal donde se entrega el premio, si la sabe', () => {
    expect(mensajeParaElCajero('CANJE_EN_OTRO_LOCAL', { local: 'Equipetrol' })).toContain(
      'Equipetrol',
    );
  });

  it('sin el nombre, dice lo que se puede decir', () => {
    expect(mensajeParaElCajero('CANJE_EN_OTRO_LOCAL')).toContain(
      'donde abrió la tarjeta',
    );
  });

  it('el de la promo le dice al cajero que avise, no que reintente', () => {
    const mensaje = mensajeParaElCajero('PROMO_NO_CONFIGURADA');
    expect(mensaje).toContain('dueño');
    expect(mensaje).not.toContain('ntentá');
  });
});
