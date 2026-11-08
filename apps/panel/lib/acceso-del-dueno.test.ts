import { describe, expect, it } from 'vitest';

import { chatDeWhatsApp, direccionDeEntrada, mensajeDeAcceso } from './acceso-del-dueno';
import { fechaYHora } from './fechas';

describe('acceso del dueno', () => {
  it('la direccion es la pagina de entrada de este mismo panel', () => {
    expect(direccionDeEntrada('https://repuntopanel.vercel.app')).toBe(
      'https://repuntopanel.vercel.app/dueno/entrar',
    );
  });

  it('el mensaje lleva el codigo, donde escribirlo y hasta cuando sirve', () => {
    const mensaje = mensajeDeAcceso({
      nombre: 'Juan Pérez',
      entrada: { codigo: 'K7QM-4R2X', expira_el: '2026-11-09T19:30:00.000Z' },
      direccion: 'https://repuntopanel.vercel.app/dueno/entrar',
      fechaYHora,
    });

    expect(mensaje).toContain('Hola Juan,');
    expect(mensaje).toContain('K7QM-4R2X');
    expect(mensaje).toContain('https://repuntopanel.vercel.app/dueno/entrar');
    // En hora de La Paz, no en la de la computadora.
    expect(mensaje).toContain('9 nov 2026, 15:30');
    expect(mensaje).toContain('No lo compartas con nadie.');
  });

  it('el chat de WhatsApp va al telefono del dueno, sin el codigo', () => {
    expect(chatDeWhatsApp('+59171234567')).toBe('https://wa.me/59171234567');
    expect(chatDeWhatsApp(null)).toBeNull();
  });
});
