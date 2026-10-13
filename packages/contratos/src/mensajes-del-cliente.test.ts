import { describe, expect, it } from 'vitest';

import {
  CODIGOS_DE_ERROR_DE_API,
  CODIGOS_DE_ERROR_DE_CAJA,
  mensajeParaElCajero,
} from './caja';
import {
  CODIGOS_DE_ERROR_DEL_CLIENTE,
  MENSAJE_GENERICO_PARA_EL_CLIENTE,
  mensajeParaElCliente,
} from './cliente';

/**
 * Los mensajes que ve el cliente en su telefono. La api responde con el
 * mensaje para el cajero; la app muestra estos.
 */
describe('mensajeParaElCliente', () => {
  it('cada codigo del cliente es un codigo real de la api', () => {
    const todos: readonly string[] = [
      ...CODIGOS_DE_ERROR_DE_CAJA,
      ...CODIGOS_DE_ERROR_DE_API,
    ];
    for (const codigo of CODIGOS_DE_ERROR_DEL_CLIENTE) {
      expect(todos, codigo).toContain(codigo);
    }
  });

  it('le habla al cliente, no al cajero', () => {
    // Los que son bugs de la app caen a proposito en el generico.
    const conMensajePropio = CODIGOS_DE_ERROR_DEL_CLIENTE.filter(
      (codigo) => mensajeParaElCliente(codigo) !== MENSAJE_GENERICO_PARA_EL_CLIENTE,
    );
    expect(conMensajePropio.length).toBeGreaterThanOrEqual(6);

    for (const codigo of conMensajePropio) {
      expect(mensajeParaElCliente(codigo), codigo).not.toBe(mensajeParaElCajero(codigo));
      // El cajero "le pide el codigo al cliente"; el cliente no se pide nada a
      // si mismo.
      expect(mensajeParaElCliente(codigo), codigo).not.toMatch(
        /Pedile el (código|nuevo)/,
      );
    }
  });

  it('ningun mensaje nombra cosas de adentro', () => {
    const adentro =
      /tabla|token|ticket|idempotenc|uuid|INV-|null|undefined|SQL|HTTP|40\d/i;
    for (const codigo of CODIGOS_DE_ERROR_DEL_CLIENTE) {
      expect(mensajeParaElCliente(codigo), codigo).not.toMatch(adentro);
    }
    expect(MENSAJE_GENERICO_PARA_EL_CLIENTE).not.toMatch(adentro);
  });

  it('un registro en curso le dice que hacer: pedirle al cajero que lo descarte', () => {
    expect(mensajeParaElCliente('REGISTRO_EN_CURSO')).toContain('descarte');
  });

  it('un codigo que la app no conoce cae en el generico, no la rompe', () => {
    expect(mensajeParaElCliente('UN_CODIGO_DEL_FUTURO')).toBe(
      MENSAJE_GENERICO_PARA_EL_CLIENTE,
    );
    // Uno de caja que nunca deberia llegarle, tambien.
    expect(mensajeParaElCliente('TURNO_CERRADO')).toBe(MENSAJE_GENERICO_PARA_EL_CLIENTE);
  });
});
