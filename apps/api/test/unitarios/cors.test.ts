import { afterEach, describe, expect, it } from 'vitest';

import {
  opcionesDeCors,
  origenPermitido,
  origenesPermitidos,
} from '../../src/seguridad/cors';

const PERMITIDOS = ['https://repunto-panel.netlify.app', 'https://*.netlify.app'];

describe('origenPermitido', () => {
  it.each([
    ['el origen exacto', 'https://repunto-panel.netlify.app'],
    ['un preview, por el comodin', 'https://deploy-preview-42--repunto.netlify.app'],
    ['otro subdominio cualquiera', 'https://lo-que-sea.netlify.app'],
  ])('acepta %s', (_caso, origen) => {
    expect(origenPermitido(origen, PERMITIDOS)).toBe(true);
  });

  it.each([
    ['un dominio ajeno', 'https://evil.com'],
    ['el dominio pelado del comodin', 'https://netlify.app'],
    ['uno que se le parece', 'https://notnetlify.app'],
    ['el comodin como sufijo de otro dominio', 'https://x.netlify.app.evil.com'],
    ['el mismo host por http', 'http://repunto-panel.netlify.app'],
    ['el host en la ruta y no en el dominio', 'https://evil.com/.netlify.app'],
    ['basura que ni siquiera es una URL', 'no-soy-un-origen'],
    ['vacio', ''],
  ])('rechaza %s', (_caso, origen) => {
    expect(origenPermitido(origen, PERMITIDOS)).toBe(false);
  });

  it('sin lista, no acepta a nadie', () => {
    expect(origenPermitido('https://repunto-panel.netlify.app', [])).toBe(false);
  });
});

describe('origenesPermitidos', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env['ORIGENES_PERMITIDOS'] = original['ORIGENES_PERMITIDOS'];
    process.env['NODE_ENV'] = original['NODE_ENV'];
  });

  it('separa por coma y limpia los espacios', () => {
    process.env['ORIGENES_PERMITIDOS'] = ' https://uno.app , https://dos.app ';
    expect(origenesPermitidos()).toEqual(['https://uno.app', 'https://dos.app']);
  });

  it('en desarrollo, por defecto son los dos frontends locales', () => {
    delete process.env['ORIGENES_PERMITIDOS'];
    process.env['NODE_ENV'] = 'development';
    expect(origenesPermitidos()).toEqual([
      'http://localhost:3000',
      'http://localhost:3002',
    ]);
  });

  it('en produccion sin la variable, la api no arranca', () => {
    delete process.env['ORIGENES_PERMITIDOS'];
    process.env['NODE_ENV'] = 'production';
    // Falla al arrancar y no en el navegador de alguien, con un error de CORS
    // que no dice que falta una variable de entorno.
    expect(() => origenesPermitidos()).toThrow(/ORIGENES_PERMITIDOS/);
  });
});

describe('opcionesDeCors', () => {
  it('nombra las cabeceras que el navegador no deja pasar solas', () => {
    const opciones = opcionesDeCors(PERMITIDOS);
    expect(opciones.allowedHeaders).toEqual(
      expect.arrayContaining(['Authorization', 'Idempotency-Key', 'If-None-Match']),
    );
  });

  it('expone ETag, que si no el panel no lo puede leer', () => {
    expect(opcionesDeCors(PERMITIDOS).exposedHeaders).toContain('ETag');
  });

  it('no manda credenciales: la caja se autentica con token, no con cookies', () => {
    expect(opcionesDeCors(PERMITIDOS).credentials).toBe(false);
  });

  it('cachea el preflight: con If-None-Match cada tres segundos, importa', () => {
    expect(opcionesDeCors(PERMITIDOS).maxAge).toBeGreaterThanOrEqual(3600);
  });

  it('deja pasar lo que no trae Origin: curl, otra api, un health check', () => {
    const opciones = opcionesDeCors(PERMITIDOS);
    let permitido: boolean | undefined;
    opciones.origin(undefined, (_error, valor) => {
      permitido = valor;
    });
    expect(permitido).toBe(true);
  });

  it('rechaza un origen que no esta en la lista', () => {
    const opciones = opcionesDeCors(PERMITIDOS);
    let permitido: boolean | undefined;
    opciones.origin('https://evil.com', (_error, valor) => {
      permitido = valor;
    });
    expect(permitido).toBe(false);
  });
});
