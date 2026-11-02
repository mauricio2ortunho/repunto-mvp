import { esquemaSellarRespuesta } from '@repunto/contratos';
import { describe, expect, it } from 'vitest';

import { limpiarEvento, limpiarMiga, problemasDelEsquema } from './sentry';

describe('limpiarEvento', () => {
  it('del pedido deja solo la ruta, sin query, y saca al usuario', () => {
    const evento = limpiarEvento({
      type: undefined,
      request: {
        url: 'https://panel/caja?x=1',
        headers: { 'User-Agent': 'tablet', Referer: 'https://panel/vincular' },
      },
      user: { ip_address: '1.2.3.4' },
    });

    expect(evento.request).toEqual({ url: 'https://panel/caja' });
    expect(evento.user).toBeUndefined();
  });

  it('tacha telefonos y codigos en los mensajes', () => {
    const evento = limpiarEvento({
      type: undefined,
      message: 'no se pudo con K7Q4M-418329',
      exception: { values: [{ type: 'Error', value: 'telefono +59170124521' }] },
    });

    expect(evento.message).toBe('no se pudo con [codigo]');
    expect(evento.exception?.values?.[0]?.value).toBe('telefono [numero]');
  });
});

describe('limpiarMiga', () => {
  it('un pedido queda sin query', () => {
    const miga = limpiarMiga({
      category: 'fetch',
      data: { url: 'https://api/caja/registros?x=1', status_code: 200 },
    });

    expect(miga.data).toEqual({ url: 'https://api/caja/registros', status_code: 200 });
  });

  it('un mensaje de la consola queda tachado', () => {
    expect(
      limpiarMiga({ category: 'console', message: 'codigo k7q4m418329' }).message,
    ).toBe('codigo [codigo]');
  });
});

describe('problemasDelEsquema', () => {
  it('dice donde fallo el contrato, nunca lo que vino', () => {
    const resultado = esquemaSellarRespuesta.safeParse({
      nombre: 'Juan +59170124521',
      progreso: 'siete',
    });
    if (resultado.success) throw new Error('tenia que fallar');

    const problemas = problemasDelEsquema(resultado.error);

    expect(problemas).toContain('progreso: invalid_type');
    expect(problemas.join(' ')).not.toContain('Juan');
    expect(problemas.join(' ')).not.toContain('siete');
  });

  it('sin la forma de un error de esquema, no inventa nada', () => {
    expect(problemasDelEsquema(new Error('otra cosa'))).toEqual([]);
  });
});
