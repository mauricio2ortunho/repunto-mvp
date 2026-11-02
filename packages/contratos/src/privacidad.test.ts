import { describe, expect, it } from 'vitest';

import { tacharDatos } from './privacidad';

describe('tacharDatos', () => {
  it.each([
    [
      'un telefono en E.164',
      'Key (telefono)=(+59170124521) already exists',
      'Key (telefono)=([numero]) already exists',
    ],
    ['un telefono sin +', 'telefono 70124521 repetido', 'telefono [numero] repetido'],
    ['el codigo del cliente con guion', 'codigo K7Q4M-418329', 'codigo [codigo]'],
    ['el codigo sin guion', 'codigo k7q4m418329', 'codigo [codigo]'],
    ['el TOTP suelto', 'totp 418329', 'totp [numero]'],
  ])('tacha %s', (_caso, texto, esperado) => {
    expect(tacharDatos(texto)).toBe(esperado);
  });

  it.each([
    [
      'un UUID, que es lo que sirve para buscar',
      'tarjeta 550e8400-e29b-41d4-a716-446655440000',
    ],
    ['un UUID con tramos de puros digitos', 'sello 11111111-1111-4111-8111-000000000008'],
    ['un numero corto', 'faltan 9 sellos, intento 3 de 20'],
    ['un codigo de error', 'CODIGO_INVALIDO en 1200 ms'],
  ])('deja %s', (_caso, texto) => {
    expect(tacharDatos(texto)).toBe(texto);
  });
});
