import { describe, expect, it } from 'vitest';

import {
  MENSAJE_GENERICO_PARA_EL_CLIENTE,
  esquemaRegistroRespuesta,
  mensajeParaElCajero,
  mensajeParaElCliente,
} from '@repunto/contratos';

import { pedir } from './http';

const BASE = 'https://api.prueba';

function responder(estado: number, cuerpo?: unknown): typeof fetch {
  return async () =>
    new Response(cuerpo === undefined ? '' : JSON.stringify(cuerpo), { status: estado });
}

const REGISTRAR = {
  metodo: 'POST' as const,
  ruta: '/registros',
  esquema: esquemaRegistroRespuesta,
};

describe('pedir', () => {
  it('una respuesta que cumple el contrato pasa', async () => {
    const r = await pedir(
      REGISTRAR,
      responder(202, { estado: 'pendiente', ticket: 't' }),
      BASE,
    );
    expect(r).toEqual({ ok: true, datos: { estado: 'pendiente', ticket: 't' } });
  });

  it('un 2xx que no cumple el contrato es un bug, no un exito', async () => {
    const r = await pedir(REGISTRAR, responder(202, { estado: 'otra cosa' }), BASE);
    expect(r).toMatchObject({ ok: false, tipo: 'incierto', causa: 'respuesta_ilegible' });
  });

  it('un rechazo se muestra con el mensaje para el cliente, no el del cajero', async () => {
    const delCajero = mensajeParaElCajero('REGISTRO_EN_CURSO');
    const r = await pedir(
      REGISTRAR,
      responder(409, { codigo: 'REGISTRO_EN_CURSO', mensaje: delCajero }),
      BASE,
    );

    expect(r).toMatchObject({ ok: false, tipo: 'rechazo', codigo: 'REGISTRO_EN_CURSO' });
    if (r.ok) return;
    expect(r.mensaje).toBe(mensajeParaElCliente('REGISTRO_EN_CURSO'));
    expect(r.mensaje).not.toBe(delCajero);
  });

  it('un 401 sin cuerpo es una sesion que no vale', async () => {
    const r = await pedir(REGISTRAR, responder(401), BASE);
    expect(r).toMatchObject({ ok: false, tipo: 'rechazo', codigo: 'TOKEN_INVALIDO' });
  });

  it('un codigo que contratos no conoce cae en el mensaje generico', async () => {
    const r = await pedir(
      REGISTRAR,
      responder(409, { codigo: 'UN_CODIGO_DEL_FUTURO', mensaje: 'x' }),
      BASE,
    );
    expect(r).toMatchObject({
      ok: false,
      tipo: 'rechazo',
      codigo: null,
      mensaje: MENSAJE_GENERICO_PARA_EL_CLIENTE,
    });
  });

  it('un 5xx es incierto: no se sabe si paso', async () => {
    const r = await pedir(REGISTRAR, responder(503), BASE);
    expect(r).toMatchObject({ ok: false, tipo: 'incierto', causa: 'servidor' });
  });

  it('sin red, incierto', async () => {
    const sinRed: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    const r = await pedir(REGISTRAR, sinRed, BASE);
    expect(r).toMatchObject({ ok: false, tipo: 'incierto', causa: 'sin_conexion' });
  });

  it('si no contesta a tiempo, lo corta', async () => {
    const colgado: typeof fetch = (_url, init) =>
      new Promise((_resolver, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(new Error('abortado')));
      });
    const r = await pedir({ ...REGISTRAR, tiempoMaximoMs: 20 }, colgado, BASE);
    expect(r).toMatchObject({ ok: false, tipo: 'incierto', causa: 'tiempo' });
  });

  it('la credencial va en Authorization y la clave en Idempotency-Key, nunca en la URL', async () => {
    let url = '';
    let cabeceras: Record<string, string> = {};
    const espia: typeof fetch = async (destino, init) => {
      url = String(destino);
      cabeceras = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ estado: 'pendiente', ticket: 't' }), {
        status: 202,
      });
    };

    await pedir({ ...REGISTRAR, token: 'secreto', clave: 'la-clave' }, espia, BASE);

    expect(url).toBe(`${BASE}/registros`);
    expect(cabeceras['authorization']).toBe('Bearer secreto');
    expect(cabeceras['idempotency-key']).toBe('la-clave');
  });
});
