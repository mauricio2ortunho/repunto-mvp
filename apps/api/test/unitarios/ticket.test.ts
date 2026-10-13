import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import { claveDerivada } from '../../src/seguridad/cifrado';
import { ticketDeRegistro } from '../../src/seguridad/ticket';

/**
 * El ticket del alta se deriva, no se sortea: es lo que permite que un
 * reintento reciba el mismo ticket sin que la base lo guarde en claro, y que
 * otro equipo con el mismo telefono reciba uno que no sirve para nada.
 */

const QR = 'demo-equipetrol';
const TEL = '+59170124521';
const CLAVE = '0b6f0c1e-9f4a-4c4e-8a51-7d3c2b1a0f9e';

describe('ticketDeRegistro', () => {
  beforeEach(() => {
    process.env['CLAVE_CIFRADO_SEMILLAS'] = randomBytes(32).toString('base64');
  });

  it('el mismo equipo reintentando recibe el mismo ticket', () => {
    expect(ticketDeRegistro(QR, TEL, CLAVE)).toBe(ticketDeRegistro(QR, TEL, CLAVE));
  });

  it.each([
    ['otra clave, que es otro equipo', [QR, TEL, `${CLAVE}x`]],
    ['otro telefono', [QR, '+59170124522', CLAVE]],
    ['otro local', ['otro-local', TEL, CLAVE]],
  ] as const)('con %s, otro ticket', (_caso, [qr, tel, clave]) => {
    expect(ticketDeRegistro(qr, tel, clave)).not.toBe(ticketDeRegistro(QR, TEL, CLAVE));
  });

  it('sin la clave del servidor no se puede calcular: con otra, otro ticket', () => {
    const conUna = ticketDeRegistro(QR, TEL, CLAVE);
    process.env['CLAVE_CIFRADO_SEMILLAS'] = randomBytes(32).toString('base64');

    expect(ticketDeRegistro(QR, TEL, CLAVE)).not.toBe(conUna);
  });

  it('los campos no se pueden correr de lugar para fabricar el mismo mensaje', () => {
    // Con un separador simple, ("a|b", "c") y ("a", "b|c") darian lo mismo.
    expect(ticketDeRegistro('a|b', 'c', CLAVE)).not.toBe(
      ticketDeRegistro('a', 'b|c', CLAVE),
    );
  });

  it('tiene el largo de un token de sesion: 32 bytes en base64url', () => {
    expect(ticketDeRegistro(QR, TEL, CLAVE)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('claveDerivada', () => {
  beforeEach(() => {
    process.env['CLAVE_CIFRADO_SEMILLAS'] = randomBytes(32).toString('base64');
  });

  it('cada proposito tiene su clave, y ninguna es la maestra', () => {
    const maestra = Buffer.from(process.env['CLAVE_CIFRADO_SEMILLAS'] ?? '', 'base64');
    const una = claveDerivada('ticket-de-registro');
    const otra = claveDerivada('otra-cosa');

    expect(una.equals(otra)).toBe(false);
    expect(una.equals(maestra)).toBe(false);
    expect(una).toHaveLength(32);
  });
});
