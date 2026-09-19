import { randomBytes } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { cifrarSemilla, descifrarSemilla } from '../../src/seguridad/cifrado';

/**
 * La semilla TOTP esta cifrada en reposo: quien lea la base no puede generar
 * los codigos de nadie.
 */
describe('cifrado de la semilla', () => {
  beforeAll(() => {
    process.env['CLAVE_CIFRADO_SEMILLAS'] = randomBytes(32).toString('base64');
  });

  it('lo que se cifra se descifra', () => {
    const semilla = 'JBSWY3DPEHPK3PXP';
    expect(descifrarSemilla(cifrarSemilla(semilla))).toBe(semilla);
  });

  it('dos cifrados de la misma semilla no se parecen', () => {
    const semilla = 'JBSWY3DPEHPK3PXP';
    expect(cifrarSemilla(semilla)).not.toBe(cifrarSemilla(semilla));
  });

  it('lo guardado no contiene la semilla', () => {
    expect(cifrarSemilla('JBSWY3DPEHPK3PXP')).not.toContain('JBSWY3DPEHPK3PXP');
  });

  it('una semilla manipulada no descifra: falla en lugar de dar codigos de nadie', () => {
    const guardado = cifrarSemilla('JBSWY3DPEHPK3PXP');
    const partes = guardado.split('.');
    const manipulado = [partes[0], partes[1], partes[2], 'AAAA'].join('.');
    expect(() => descifrarSemilla(manipulado)).toThrow();
  });

  it('con otra clave tampoco', () => {
    const guardado = cifrarSemilla('JBSWY3DPEHPK3PXP');
    process.env['CLAVE_CIFRADO_SEMILLAS'] = randomBytes(32).toString('base64');
    expect(() => descifrarSemilla(guardado)).toThrow();
  });

  it('sin clave configurada, no arranca en silencio', () => {
    delete process.env['CLAVE_CIFRADO_SEMILLAS'];
    expect(() => cifrarSemilla('JBSWY3DPEHPK3PXP')).toThrow(/CLAVE_CIFRADO_SEMILLAS/);
  });
});
