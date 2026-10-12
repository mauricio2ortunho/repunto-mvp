import { describe, expect, it, vi } from 'vitest';
import { esquemaSellarRespuesta, mensajeParaElCajero } from '@repunto/contratos';
import { interpretar, type Crudo } from './http';

const crudo = (estado: number, cuerpo: unknown): Crudo => ({ estado, cabeceras: new Headers(), cuerpo });
const sello = {
  nombre: 'Juan',
  progreso: 7,
  faltan: 3,
  completa: false,
  premio: 'Café',
  sello_id: '3f1c2b9e-8d4a-4c6b-9a7e-1b2c3d4e5f60',
};

describe('interpretar una respuesta', () => {
  it('un 2xx que cumple el contrato es ok', () => {
    expect(interpretar(crudo(200, sello), esquemaSellarRespuesta)).toMatchObject({ ok: true, datos: sello });
  });

  it('un 2xx que no cumple el contrato no se muestra como exito: queda incierto', () => {
    // El aviso en consola es a proposito; aca solo ensucia la salida del test.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = interpretar(crudo(200, { nombre: 'Juan' }), esquemaSellarRespuesta);
    expect(consola).toHaveBeenCalledOnce();
    consola.mockRestore();
    expect(r).toEqual({ ok: false, tipo: 'incierto', causa: 'respuesta_ilegible' });
  });

  it('un rechazo con la forma del contrato trae su mensaje tal cual', () => {
    const cuerpo = { codigo: 'DEMASIADO_PRONTO', mensaje: 'Ya selló hace poco. Puede volver a sellar a las 14:30.' };
    expect(interpretar(crudo(409, cuerpo), esquemaSellarRespuesta)).toEqual({
      ok: false, tipo: 'rechazo', codigo: 'DEMASIADO_PRONTO', mensaje: cuerpo.mensaje, estado: 409,
    });
  });

  it('un codigo que contratos todavia no conoce igual muestra su mensaje', () => {
    const r = interpretar(crudo(409, { codigo: 'ALGO_NUEVO', mensaje: 'Hacé tal cosa.' }), esquemaSellarRespuesta);
    expect(r).toMatchObject({ ok: false, tipo: 'rechazo', codigo: null, mensaje: 'Hacé tal cosa.' });
  });

  it('un 401 sin cuerpo se explica como tablet sin vincular', () => {
    expect(interpretar(crudo(401, undefined), esquemaSellarRespuesta)).toMatchObject({
      tipo: 'rechazo', codigo: 'TOKEN_INVALIDO', mensaje: mensajeParaElCajero('TOKEN_INVALIDO'),
    });
  });

  it('un 429 sin cuerpo pide esperar', () => {
    expect(interpretar(crudo(429, undefined), esquemaSellarRespuesta)).toMatchObject({ codigo: 'TOPE_SUPERADO' });
  });

  it('un 5xx sin la forma del contrato es incierto: puede haber pasado', () => {
    expect(interpretar(crudo(502, undefined), esquemaSellarRespuesta)).toEqual({
      ok: false, tipo: 'incierto', causa: 'servidor',
    });
  });
});
