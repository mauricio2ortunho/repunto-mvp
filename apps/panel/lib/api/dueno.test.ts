import { describe, expect, it } from 'vitest';

import type { Fallo } from './http';
import { OPERACIONES_DEL_DUENO, mensajeParaElDueno } from './dueno';

const rechazo = (codigo: Extract<Fallo, { tipo: 'rechazo' }>['codigo']): Fallo => ({
  ok: false,
  tipo: 'rechazo',
  codigo,
  mensaje: 'el texto de la api',
  estado: 404,
});

describe('mensajeParaElDueno', () => {
  it('lo que ya no está no lo manda a la ficha del admin', () => {
    for (const codigo of [
      'LOCAL_NO_ENCONTRADO',
      'PERSONA_NO_ENCONTRADA',
      'TABLET_NO_ENCONTRADA',
    ] as const) {
      const texto = mensajeParaElDueno(rechazo(codigo));
      expect(texto).not.toMatch(/ficha/i);
      expect(texto).toMatch(/Recargá/);
    }
  });

  it('un local cerrado lo reabre Repunto, no él', () => {
    expect(mensajeParaElDueno(rechazo('LOCAL_CERRADO'))).toMatch(/Repunto/);
  });

  it('el resto, con el texto de la api', () => {
    expect(mensajeParaElDueno(rechazo('NOMBRE_REPETIDO'))).toBe('el texto de la api');
  });
});

describe('OPERACIONES_DEL_DUENO', () => {
  it('no abre ni cierra locales, no maneja dueños', () => {
    expect(OPERACIONES_DEL_DUENO.crearLocal).toBeNull();
    expect(OPERACIONES_DEL_DUENO.cambiarEstadoDelLocal).toBeNull();
    expect(OPERACIONES_DEL_DUENO.manejaDuenos).toBe(false);
    expect(OPERACIONES_DEL_DUENO.generarEntradaDelDueno).toBeNull();
  });

  it('el cartel del QR queda dentro del panel del dueño', () => {
    expect(OPERACIONES_DEL_DUENO.rutaDelQr('abc')).toBe('/dueno/locales/abc/qr');
  });
});
