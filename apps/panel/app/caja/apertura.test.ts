import { describe, expect, it } from 'vitest';

import {
  type Apertura,
  type EventoDeApertura,
  aperturaInicial,
  hayQueEnviar,
  reducirApertura,
} from './apertura';

const MARTA = {
  id: '3f1c2b9e-8d4a-4c6b-9a7e-1b2c3d4e5f60',
  nombre: 'Marta',
  rol: 'cajero' as const,
};

const correr = (...eventos: EventoDeApertura[]): Apertura =>
  eventos.reduce(reducirApertura, aperturaInicial);

describe('reducirApertura', () => {
  it('elegir un nombre pasa al PIN, vacio', () => {
    expect(correr({ tipo: 'eligio', usuario: MARTA })).toEqual({
      paso: 'pin',
      usuario: MARTA,
      pin: '',
      enviando: false,
      aviso: null,
    });
  });

  it('el PIN solo guarda digitos, y nunca mas de cuatro', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '1a2345' },
    );
    expect(e.paso === 'pin' && e.pin).toBe('1234');
  });

  it('con cuatro digitos hay que enviar; con tres, no', () => {
    expect(
      hayQueEnviar(
        correr({ tipo: 'eligio', usuario: MARTA }, { tipo: 'tecleo', pin: '123' }),
      ),
    ).toBe(false);
    expect(
      hayQueEnviar(
        correr({ tipo: 'eligio', usuario: MARTA }, { tipo: 'tecleo', pin: '1234' }),
      ),
    ).toBe(true);
  });

  it('mientras viaja no se envia de nuevo ni se puede teclear', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '1234' },
      { tipo: 'envio' },
      { tipo: 'tecleo', pin: '9' },
    );
    expect(hayQueEnviar(e)).toBe(false);
    expect(e.paso === 'pin' && e.pin).toBe('1234');
  });

  it('un PIN equivocado borra lo tecleado y muestra el motivo', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '1234' },
      { tipo: 'envio' },
      {
        tipo: 'fallo',
        codigo: 'PIN_INCORRECTO',
        mensaje: 'PIN incorrecto. Probá de nuevo.',
      },
    );
    expect(e).toMatchObject({
      paso: 'pin',
      pin: '',
      enviando: false,
      aviso: 'PIN incorrecto. Probá de nuevo.',
    });
  });

  it('el aviso se va al empezar el siguiente intento', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '1234' },
      { tipo: 'envio' },
      { tipo: 'fallo', codigo: 'PIN_INCORRECTO', mensaje: 'PIN incorrecto.' },
      { tipo: 'tecleo', pin: '5' },
    );
    expect(e.paso === 'pin' && e.aviso).toBeNull();
  });

  it('bloqueado, se queda en el PIN con el mensaje de la api', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '1234' },
      { tipo: 'envio' },
      { tipo: 'fallo', codigo: 'PIN_BLOQUEADO', mensaje: 'Probá de nuevo a las 14:30.' },
    );
    expect(e).toMatchObject({ paso: 'pin', aviso: 'Probá de nuevo a las 14:30.' });
  });

  it('si la persona ya no puede abrir turno, vuelve a la lista con el motivo', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '1234' },
      { tipo: 'envio' },
      { tipo: 'fallo', codigo: 'USUARIO_NO_HABILITADO', mensaje: 'Avisá al dueño.' },
    );
    expect(e).toEqual({ paso: 'lista', aviso: 'Avisá al dueño.' });
  });

  it('volver lleva a la lista, sin el PIN tecleado', () => {
    const e = correr(
      { tipo: 'eligio', usuario: MARTA },
      { tipo: 'tecleo', pin: '12' },
      { tipo: 'volvio' },
    );
    expect(e).toEqual(aperturaInicial);
  });
});
