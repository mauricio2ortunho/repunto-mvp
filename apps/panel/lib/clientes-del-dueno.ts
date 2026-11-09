import type { ClienteDelDueno } from '@repunto/contratos';

import { fecha } from './fechas';
import { telefonoParaVer } from './personas-del-admin';
import { haceCuanto } from './tablets-del-admin';

/**
 * La lista de clientes del panel del dueño: qué filtro mira, qué busca y cómo
 * se dice cada cliente. Lo que es activo o enfriado lo decide la api con las
 * definiciones del dominio; acá solo se elige y se escribe.
 */

export const FILTROS_DE_CLIENTES = [
  { id: 'todos', titulo: 'Todos' },
  { id: 'enfriados', titulo: 'Dejaron de venir' },
  { id: 'nuevos', titulo: 'Nuevos este mes' },
  { id: 'premio', titulo: 'Con premio para retirar' },
] as const;

export type FiltroDeClientes = (typeof FILTROS_DE_CLIENTES)[number]['id'];

/** Lo que llega en `?ver=`; cualquier otra cosa es "todos". */
export function filtroDesde(texto: string | undefined): FiltroDeClientes {
  return FILTROS_DE_CLIENTES.find((f) => f.id === texto)?.id ?? 'todos';
}

/** Completó su tarjeta y todavía no retiró el premio. */
export function tienePremioParaRetirar(c: ClienteDelDueno): boolean {
  return c.tarjeta !== null && c.tarjeta.sellos >= c.tarjeta.sellos_requeridos;
}

function cumple(c: ClienteDelDueno, filtro: FiltroDeClientes): boolean {
  switch (filtro) {
    case 'todos':
      return true;
    case 'enfriados':
      return c.enfriado;
    case 'nuevos':
      return c.nuevo_del_mes;
    case 'premio':
      return tienePremioParaRetirar(c);
  }
}

/** Sin acentos ni mayúsculas: "maria" encuentra a "María". */
function plano(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Los del filtro que coinciden con lo buscado: por nombre, o por los números
 * del teléfono si se tipearon al menos tres ("4568", "7001 2345").
 */
export function clientesQueSeVen(
  clientes: readonly ClienteDelDueno[],
  filtro: FiltroDeClientes,
  buscado: string,
): ClienteDelDueno[] {
  const texto = plano(buscado);
  const digitos = buscado.replace(/\D/g, '');
  return clientes.filter((c) => {
    if (!cumple(c, filtro)) return false;
    if (texto === '') return true;
    if (plano(c.nombre).includes(texto)) return true;
    return digitos.length >= 3 && c.telefono.replace(/\D/g, '').includes(digitos);
  });
}

/** Cuántos hay en cada filtro, para mostrarlo en el botón. */
export function cuantosPorFiltro(
  clientes: readonly ClienteDelDueno[],
): Record<FiltroDeClientes, number> {
  return {
    todos: clientes.length,
    enfriados: clientes.filter((c) => c.enfriado).length,
    nuevos: clientes.filter((c) => c.nuevo_del_mes).length,
    premio: clientes.filter(tienePremioParaRetirar).length,
  };
}

export { telefonoParaVer };

/** "3 sellos · última visita hace 5 días · 1 premio". */
export function historiaDelCliente(c: ClienteDelDueno, ahora: Date): string {
  if (c.ultimo_sello === null) return 'Todavía sin sellos';
  const partes = [
    c.sellos === 1 ? '1 sello' : `${c.sellos} sellos`,
    `última visita ${haceCuanto(c.ultimo_sello, ahora)}`,
  ];
  if (c.premios > 0) partes.push(c.premios === 1 ? '1 premio' : `${c.premios} premios`);
  return partes.join(' · ');
}

/**
 * "Tarjeta: 3 de 10 · vence el 12 dic", o lo que le falta. Null sin tarjeta
 * activa. Una que ya pasó su fecha dice "venció": la tarea nocturna la marca
 * vencida recién esa noche.
 */
export function tarjetaDelCliente(c: ClienteDelDueno, ahora: Date): string | null {
  if (c.tarjeta === null) return null;
  const { sellos, sellos_requeridos, vence_el } = c.tarjeta;
  if (sellos >= sellos_requeridos)
    return 'Completó la tarjeta: tiene el premio para retirar';
  const base = `Tarjeta: ${sellos} de ${sellos_requeridos}`;
  if (vence_el === null) return base;
  const verbo = Date.parse(vence_el) <= ahora.getTime() ? 'venció' : 'vence';
  return `${base} · ${verbo} el ${fecha(vence_el)}`;
}

/**
 * Lo que el dueño le escribe a un cliente que dejó de venir, ya armado: lo
 * edita en WhatsApp antes de mandarlo. Le recuerda lo que tiene en la
 * tarjeta, si todavía le sirve: una vencida no se menciona.
 */
export function mensajeParaQueVuelva(
  c: ClienteDelDueno,
  negocio: string,
  ahora: Date,
): string {
  const nombre = c.nombre.trim().split(/\s+/)[0] ?? c.nombre;
  const partes = [
    `¡Hola ${nombre}! Te escribimos de ${negocio}. Hace rato que no te vemos por acá.`,
  ];
  const t = c.tarjeta;
  const vigente =
    t !== null && (t.vence_el === null || Date.parse(t.vence_el) > ahora.getTime());
  if (t !== null && vigente && t.sellos >= t.sellos_requeridos) {
    partes.push('Tenés tu premio esperándote.');
  } else if (t !== null && vigente && t.sellos > 0) {
    const vence =
      t.vence_el === null ? '' : `, y te sirven hasta el ${fecha(t.vence_el)}`;
    partes.push(
      `Ya tenés ${t.sellos} de ${t.sellos_requeridos} sellos en tu tarjeta${vence}.`,
    );
  }
  partes.push('¡Te esperamos!');
  return partes.join(' ');
}

/** El chat de WhatsApp con ese cliente, con el mensaje escrito. Lo abre su celular. */
export function chatParaQueVuelva(
  c: ClienteDelDueno,
  negocio: string,
  ahora: Date,
): string {
  const digitos = c.telefono.replace(/\D/g, '');
  const texto = encodeURIComponent(mensajeParaQueVuelva(c, negocio, ahora));
  return `https://wa.me/${digitos}?text=${texto}`;
}
