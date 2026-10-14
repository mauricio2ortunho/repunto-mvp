import { describe, expect, it } from 'vitest';

import { queSigue, ultimosCuatroDe } from './siguiente';

describe('queSigue', () => {
  it('pendiente: seguir esperando al cajero', () => {
    expect(queSigue({ estado: 'pendiente' }, false)).toEqual({
      tipo: 'seguir_esperando',
    });
  });

  it('confirmado con token: entrar con la sesion nueva', () => {
    expect(queSigue({ estado: 'confirmado', token: 't' }, false)).toEqual({
      tipo: 'entrar',
      token: 't',
    });
  });

  it('confirmado sin token, y este telefono ya tiene sesion: entrar igual', () => {
    expect(queSigue({ estado: 'confirmado' }, true)).toEqual({
      tipo: 'entrar',
      token: null,
    });
  });

  it('confirmado sin token y sin sesion: no hay como entrar', () => {
    expect(queSigue({ estado: 'confirmado' }, false)).toEqual({
      tipo: 'terminar',
      motivo: 'sin_sesion',
    });
  });

  describe('un cliente que ya tenia cuenta (especificacion, seccion 3)', () => {
    it('desde su propio telefono, con sesion: la tarjeta nueva aparece en su lista', () => {
      expect(queSigue({ estado: 'verificacion_requerida' }, true)).toEqual({
        tipo: 'entrar',
        token: null,
      });
    });

    it('desde un telefono sin sesion: no recibe la cuenta', () => {
      // La confirmacion presencial no autentica a alguien que ya existe.
      expect(queSigue({ estado: 'verificacion_requerida' }, false)).toEqual({
        tipo: 'terminar',
        motivo: 'ya_tiene_cuenta',
      });
    });
  });

  it('vencido y descartado terminan', () => {
    expect(queSigue({ estado: 'vencido' }, true)).toEqual({
      tipo: 'terminar',
      motivo: 'vencido',
    });
    expect(queSigue({ estado: 'descartado' }, true)).toEqual({
      tipo: 'terminar',
      motivo: 'descartado',
    });
  });
});

describe('ultimosCuatroDe', () => {
  it.each([
    ['70124521', '4521'],
    ['701 24 521', '4521'],
    ['+591 70124521', '4521'],
  ])('%s termina en %s', (telefono, final) => {
    expect(ultimosCuatroDe(telefono)).toBe(final);
  });
});
