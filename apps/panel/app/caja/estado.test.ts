import { describe, expect, it } from 'vitest';
import { estadoInicial, reducir, type Estado, type Evento } from './estado';

const correr = (...eventos: Evento[]): Estado => eventos.reduce(reducir, estadoInicial);
const SELLO_ID = '3f1c2b9e-8d4a-4c6b-9a7e-1b2c3d4e5f60';
const sello = (progreso: number, faltan: number, completa = false) => ({
  nombre: 'Ana Rojas',
  progreso,
  faltan,
  completa,
  premio: 'Café americano',
  sello_id: SELLO_ID,
});

describe('la caja', () => {
  it('al sellar se borra el resultado anterior: es de otro cliente', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(7, 3) },
      { tipo: 'escribio', codigo: 'A9P2X-000001' },
      { tipo: 'empezo', accion: 'sellar' },
    );
    expect(e.modo === 'sellar' && e.ultimo.tipo).toBe('nada');
  });

  it('un sello que no completa deja el resultado y el campo vacio', () => {
    const e = correr(
      { tipo: 'escribio', codigo: 'X' },
      { tipo: 'empezo', accion: 'sellar' },
      { tipo: 'sellado', datos: sello(8, 2) },
    );
    expect(e).toMatchObject({
      modo: 'sellar',
      codigo: '',
      ocupado: null,
      ultimo: { tipo: 'sello' },
    });
  });

  it('la tarjeta completa la decide `completa`, no `faltan`', () => {
    // Si la API dijera faltan 0 pero completa false, se le cree a la API.
    expect(correr({ tipo: 'sellado', datos: sello(10, 0, false) }).modo).toBe('sellar');
    expect(correr({ tipo: 'sellado', datos: sello(10, 0, true) }).modo).toBe('canjear');
  });

  it('al completar, el canje arranca con el campo vacio: el codigo ya se gasto', () => {
    const e = correr(
      { tipo: 'escribio', codigo: 'A9P2X-000001' },
      { tipo: 'sellado', datos: sello(10, 0, true) },
    );
    expect(e).toMatchObject({
      modo: 'canjear',
      codigo: '',
      tarjeta: { nombre: 'Ana Rojas' },
    });
  });

  it('TARJETA_COMPLETA al sellar lleva al canje con el mensaje de la API', () => {
    const e = correr({
      tipo: 'fallo',
      codigo: 'TARJETA_COMPLETA',
      mensaje: 'Ya tiene el premio listo.',
    });
    expect(e).toMatchObject({
      modo: 'canjear',
      tarjeta: null,
      contexto: 'Ya tiene el premio listo.',
    });
  });

  it('un rechazo deja el codigo seleccionado y vuelve el foco', () => {
    const antes = correr({ tipo: 'escribio', codigo: 'K7Q4M-1' });
    const e = reducir(antes, {
      tipo: 'fallo',
      codigo: 'CODIGO_INVALIDO',
      mensaje: 'No vale.',
    });
    expect(e).toMatchObject({
      codigo: 'K7Q4M-1',
      seleccionar: true,
      ultimo: { tipo: 'aviso', mensaje: 'No vale.' },
    });
    expect(e.vuelta).toBe(antes.vuelta + 1);
  });

  it('un rechazo en el canje no saca del canje', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(10, 0, true) },
      { tipo: 'fallo', codigo: 'CODIGO_YA_USADO', mensaje: 'Ese código ya se usó.' },
    );
    expect(e).toMatchObject({ modo: 'canjear', aviso: 'Ese código ya se usó.' });
  });

  it('entregar el premio vuelve a la caja con el resultado del canje', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(10, 0, true) },
      {
        tipo: 'canjeado',
        datos: { nombre: 'Ana Rojas', premio: 'Café americano', sobrantes: 0 },
      },
    );
    expect(e).toMatchObject({ modo: 'sellar', ultimo: { tipo: 'canje' } });
  });

  it('confirmar un registro no borra lo que el cajero estaba tipeando', () => {
    const e = correr(
      { tipo: 'escribio', codigo: 'K7Q4' },
      { tipo: 'empezo', accion: 'confirmar' },
      { tipo: 'confirmado', datos: { ...sello(1, 9), sello: true } },
    );
    expect(e).toMatchObject({ codigo: 'K7Q4', ultimo: { tipo: 'alta' } });
  });

  it('descartar no borra el resultado que estaba en pantalla', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(7, 3) },
      { tipo: 'empezo', accion: 'descartar' },
      { tipo: 'descartado' },
    );
    expect(e.modo === 'sellar' && e.ultimo.tipo).toBe('sello');
  });

  it('la tarjeta completa guarda el sello que la completo, para poder deshacerlo', () => {
    const e = correr({ tipo: 'sellado', datos: sello(10, 0, true) });
    expect(e.modo === 'canjear' && e.tarjeta?.sello_id).toBe(SELLO_ID);
  });

  it('mientras se deshace, la tarjeta sigue en pantalla: es el mismo cliente', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(8, 2) },
      { tipo: 'empezo', accion: 'anular' },
    );
    expect(e).toMatchObject({ ocupado: 'anular', ultimo: { tipo: 'sello' } });
  });

  it('si deshacer falla, el sello sigue en pantalla con el motivo y se puede reintentar', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(8, 2) },
      { tipo: 'empezo', accion: 'anular' },
      { tipo: 'fallo', codigo: null, mensaje: 'Se cortó la conexión.' },
    );
    expect(e).toMatchObject({
      modo: 'sellar',
      ocupado: null,
      ultimo: { tipo: 'sello', aviso: 'Se cortó la conexión.' },
    });
    expect(
      e.modo === 'sellar' && e.ultimo.tipo === 'sello' && e.ultimo.datos.sello_id,
    ).toBe(SELLO_ID);
  });

  it('al reintentar deshacer, el motivo del fallo anterior se borra', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(8, 2) },
      { tipo: 'empezo', accion: 'anular' },
      { tipo: 'fallo', codigo: null, mensaje: 'Se cortó la conexión.' },
      { tipo: 'empezo', accion: 'anular' },
    );
    expect(
      e.modo === 'sellar' && e.ultimo.tipo === 'sello' && e.ultimo.aviso,
    ).toBeUndefined();
  });

  it('el fallo de otra cosa reemplaza el resultado, como siempre', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(8, 2) },
      { tipo: 'empezo', accion: 'sellar' },
      { tipo: 'fallo', codigo: 'CODIGO_INVALIDO', mensaje: 'Ese código no es válido.' },
    );
    expect(e).toMatchObject({ ultimo: { tipo: 'aviso' } });
  });

  it('deshacer desde el canje vuelve a la caja: ya no hay premio que entregar', () => {
    const e = correr(
      { tipo: 'sellado', datos: sello(10, 0, true) },
      { tipo: 'empezo', accion: 'anular' },
      {
        tipo: 'anulado',
        datos: { nombre: 'Ana Rojas', progreso: 9, faltan: 1, completa: false },
      },
    );
    expect(e).toMatchObject({ modo: 'sellar', codigo: '', ultimo: { tipo: 'anulado' } });
  });
});
