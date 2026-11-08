import type { EntradaDelDueno } from '@repunto/contratos';

/**
 * Lo que el admin le manda al dueño para que entre a su panel, mientras no
 * exista WhatsApp: el código, dónde escribirlo y hasta cuándo sirve. El texto
 * se arma acá para que el admin lo copie entero y no se le escape ninguna de
 * las tres cosas.
 */

/** La página donde el dueño escribe el código: es de este mismo panel. */
export function direccionDeEntrada(origen: string): string {
  return `${origen}/dueno/entrar`;
}

export function mensajeDeAcceso(d: {
  nombre: string;
  entrada: EntradaDelDueno;
  direccion: string;
  /** Cómo mostrar `expira_el`: "9 nov 2026, 15:30". */
  fechaYHora: (iso: string) => string;
}): string {
  const nombre = d.nombre.split(' ')[0] ?? d.nombre;
  return [
    `Hola ${nombre}, este es tu código para entrar al panel de tu negocio en Repunto: ${d.entrada.codigo}`,
    `Abrí ${d.direccion} en tu celular y escribilo.`,
    `Sirve una sola vez y vence el ${d.fechaYHora(d.entrada.expira_el)}. No lo compartas con nadie.`,
  ].join('\n\n');
}

/**
 * El chat de WhatsApp con el dueño, sin el mensaje: el código no viaja en
 * la dirección. El admin pega el mensaje que copió.
 */
export function chatDeWhatsApp(telefono: string | null): string | null {
  if (telefono === null) return null;
  const digitos = telefono.replace(/\D/g, '');
  return digitos === '' ? null : `https://wa.me/${digitos}`;
}
