import { describe, expect, it } from 'vitest';
import { crearGestorDeIdempotencia, generarUuid } from './idempotencia';

const secuencia = () => {
  let n = 0;
  return () => `clave-${++n}`;
};

describe('claves de idempotencia', () => {
  it('el reintento de una accion sin respuesta viaja con la misma clave', () => {
    const g = crearGestorDeIdempotencia(secuencia());
    expect(g.clavePara('sellar:K7Q4M-418329')).toBe('clave-1');
    expect(g.clavePara('sellar:K7Q4M-418329')).toBe('clave-1');
  });

  it('con respuesta, el mismo cuerpo es otra accion y lleva otra clave', () => {
    const g = crearGestorDeIdempotencia(secuencia());
    g.clavePara('sellar:K7Q4M-418329');
    g.olvidar('sellar:K7Q4M-418329');
    expect(g.clavePara('sellar:K7Q4M-418329')).toBe('clave-2');
  });

  it('otro codigo es otra accion: nunca la misma clave con otro cuerpo', () => {
    const g = crearGestorDeIdempotencia(secuencia());
    expect(g.clavePara('sellar:K7Q4M-418329')).not.toBe(
      g.clavePara('sellar:K7Q4M-551002'),
    );
  });

  it('una accion en el aire no pierde su clave porque en el medio paso otra', () => {
    const g = crearGestorDeIdempotencia(secuencia());
    g.clavePara('sellar:K7Q4M-418329');
    g.clavePara('confirmar:abc:true');
    g.olvidar('confirmar:abc:true');
    expect(g.clavePara('sellar:K7Q4M-418329')).toBe('clave-1');
  });

  it('pasados cinco minutos ya no es un reintento', () => {
    let t = 0;
    const g = crearGestorDeIdempotencia(secuencia(), () => t);
    g.clavePara('sellar:K7Q4M-418329');
    t = 5 * 60 * 1000 + 1;
    expect(g.clavePara('sellar:K7Q4M-418329')).toBe('clave-2');
  });

  it('genera uuid v4 aunque no exista randomUUID (http en la red del local)', () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(generarUuid()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});
