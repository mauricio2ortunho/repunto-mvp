import { describe, expect, it } from 'vitest';

import { AHORA } from './pruebas/escenario';
import {
  type EstadoParaElCliente,
  type SituacionDeTarjeta,
  estadoParaElCliente,
  ordenarParaElCliente,
} from './tarjeta-del-cliente';

const DIA = 24 * 60 * 60 * 1000;

function una(cambios: Partial<SituacionDeTarjeta> = {}): SituacionDeTarjeta {
  return {
    estado: 'activa',
    vence_el: new Date(AHORA.getTime() + 10 * DIA),
    progreso: 3,
    sellos_requeridos: 10,
    ultimo_sello: new Date(AHORA.getTime() - DIA),
    negocio_suspendido: false,
    ...cambios,
  };
}

function estadoDe(cambios: Partial<SituacionDeTarjeta>): EstadoParaElCliente {
  return estadoParaElCliente(una(cambios), AHORA);
}

describe('estadoParaElCliente', () => {
  it('juntando sellos: en curso', () => {
    expect(estadoDe({})).toBe('en_curso');
  });

  it('una tarjeta recien abierta, sin sellos, esta en curso y no vence (INV-12)', () => {
    expect(estadoDe({ progreso: 0, vence_el: null, ultimo_sello: null })).toBe(
      'en_curso',
    );
  });

  it('con los sellos del premio: completa', () => {
    expect(estadoDe({ progreso: 10 })).toBe('completa');
  });

  it('cuenta los requeridos de SU programa, no los del vigente (INV-6)', () => {
    // El negocio subio a 12, pero esta tarjeta empezo con 8: ya esta completa.
    expect(estadoDe({ progreso: 8, sellos_requeridos: 8 })).toBe('completa');
  });

  it('el dia del vencimiento todavia no esta vencida', () => {
    expect(estadoDe({ vence_el: new Date(AHORA.getTime() + 1) })).toBe('en_curso');
  });

  it('pasada la fecha esta vencida, aunque nadie la haya marcado', () => {
    // El cron que marca las vencidas no corre: se decide por fecha.
    expect(estadoDe({ estado: 'activa', vence_el: new Date(AHORA.getTime() - 1) })).toBe(
      'vencida',
    );
  });

  it('y si el cron ya la marco, tambien', () => {
    expect(estadoDe({ estado: 'vencida' })).toBe('vencida');
  });

  it('el premio entregado: canjeada', () => {
    expect(estadoDe({ estado: 'canjeada', progreso: 10 })).toBe('canjeada');
  });

  it('con el negocio suspendido: congelada, no desaparece', () => {
    expect(estadoDe({ negocio_suspendido: true })).toBe('congelada');
  });

  describe('la prioridad, de lo definitivo a lo transitorio', () => {
    it('completa pero vencida es vencida: la caja no le daria el premio', () => {
      expect(estadoDe({ progreso: 10, vence_el: new Date(AHORA.getTime() - 1) })).toBe(
        'vencida',
      );
    });

    it('completa con el negocio suspendido es congelada: tampoco hay premio', () => {
      expect(estadoDe({ progreso: 10, negocio_suspendido: true })).toBe('congelada');
    });

    it('vencida con el negocio suspendido sigue vencida: es final', () => {
      expect(
        estadoDe({ negocio_suspendido: true, vence_el: new Date(AHORA.getTime() - 1) }),
      ).toBe('vencida');
    });

    it('canjeada gana sobre todo', () => {
      expect(
        estadoDe({
          estado: 'canjeada',
          negocio_suspendido: true,
          vence_el: new Date(AHORA.getTime() - 1),
        }),
      ).toBe('canjeada');
    });
  });
});

describe('ordenarParaElCliente', () => {
  function nombres(tarjetas: (SituacionDeTarjeta & { nombre: string })[]): string[] {
    return ordenarParaElCliente(tarjetas, AHORA).map((t) => t.nombre);
  }

  it('primero las completas, despues las en curso, al final las que ya no suman', () => {
    expect(
      nombres([
        { ...una({ estado: 'vencida' }), nombre: 'vencida' },
        { ...una({ negocio_suspendido: true }), nombre: 'congelada' },
        { ...una(), nombre: 'en curso' },
        { ...una({ progreso: 10 }), nombre: 'completa' },
      ]),
    ).toEqual(['completa', 'en curso', 'congelada', 'vencida']);
  });

  it('entre las en curso, la que menos sellos le faltan va primero', () => {
    expect(
      nombres([
        { ...una({ progreso: 2 }), nombre: 'le faltan 8' },
        { ...una({ progreso: 9 }), nombre: 'le falta 1' },
        { ...una({ progreso: 5 }), nombre: 'le faltan 5' },
      ]),
    ).toEqual(['le falta 1', 'le faltan 5', 'le faltan 8']);
  });

  it('se cuenta en sellos, no en porcentaje', () => {
    // 4 de 5 es el 80 % y le falta 1; 8 de 10 es el mismo 80 % y le faltan 2.
    expect(
      nombres([
        { ...una({ progreso: 8, sellos_requeridos: 10 }), nombre: 'faltan 2' },
        { ...una({ progreso: 4, sellos_requeridos: 5 }), nombre: 'falta 1' },
      ]),
    ).toEqual(['falta 1', 'faltan 2']);
  });

  it('a igual distancia, la usada mas recientemente primero', () => {
    expect(
      nombres([
        {
          ...una({ ultimo_sello: new Date(AHORA.getTime() - 9 * DIA) }),
          nombre: 'vieja',
        },
        { ...una({ ultimo_sello: new Date(AHORA.getTime() - DIA) }), nombre: 'reciente' },
        { ...una({ ultimo_sello: null, progreso: 3 }), nombre: 'sin sellos' },
      ]),
    ).toEqual(['reciente', 'vieja', 'sin sellos']);
  });

  it('no toca el arreglo que recibe', () => {
    const tarjetas = [
      { ...una({ progreso: 2 }), nombre: 'b' },
      { ...una({ progreso: 9 }), nombre: 'a' },
    ];
    ordenarParaElCliente(tarjetas, AHORA);
    expect(tarjetas.map((t) => t.nombre)).toEqual(['b', 'a']);
  });
});
