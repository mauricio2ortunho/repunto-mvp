import {
  type FichaDelNegocio,
  FORMATO_DEL_PIN,
  LIMITES_DE_PERSONA,
  type PersonaDelAdmin,
  type PersonaNueva,
  type RolDePersona,
  esquemaPersonaNueva,
} from '@repunto/contratos';

/**
 * Las personas en la ficha del negocio: que se puede mandar y como se
 * muestra cada una. Lo que decide si se puede, lo decide la api.
 */

export const TITULOS_DE_ROL: Record<RolDePersona, string> = {
  dueno: 'Dueño',
  supervisor: 'Supervisor',
  cajero: 'Cajero',
};

export interface BorradorDePersona {
  nombre: string;
  rol: RolDePersona | '';
  /** Solo para el dueño: los demás entran con nombre y PIN en la tablet. */
  telefono: string;
  locales: string[];
  pin: string;
  /** El PIN otra vez: se escribe oculto, y uno mal tipeado no se ve. */
  pinOtraVez: string;
}

export const PERSONA_VACIA: Readonly<BorradorDePersona> = {
  nombre: '',
  rol: '',
  telefono: '',
  locales: [],
  pin: '',
  pinOtraVez: '',
};

export type CampoDePersona = keyof BorradorDePersona;

export type Problemas = Partial<Record<CampoDePersona, string>>;

/**
 * El PIN de dos campos. `obligatorio`: supervisor y cajero lo necesitan para
 * aparecer en la tablet; el dueño, solo si atiende la caja.
 */
export function revisarPin(
  b: Pick<BorradorDePersona, 'pin' | 'pinOtraVez'>,
  obligatorio: boolean,
): { ok: true; pin: string | null } | { ok: false; problemas: Problemas } {
  if (b.pin === '' && b.pinOtraVez === '') {
    return obligatorio
      ? { ok: false, problemas: { pin: 'Que escriba su PIN de cuatro números.' } }
      : { ok: true, pin: null };
  }
  if (!FORMATO_DEL_PIN.test(b.pin)) {
    return { ok: false, problemas: { pin: 'Son cuatro números.' } };
  }
  if (b.pin !== b.pinOtraVez) {
    return { ok: false, problemas: { pinOtraVez: 'No coincide con el primero.' } };
  }
  return { ok: true, pin: b.pin };
}

export type RevisionDePersona =
  | { ok: true; peticion: PersonaNueva; pin: string | null }
  | { ok: false; problemas: Problemas };

export function revisarPersona(b: BorradorDePersona): RevisionDePersona {
  const problemas: Problemas = {};

  const nombre = b.nombre.trim();
  if (nombre === '')
    problemas.nombre = 'Escribí el nombre, como se lo va a ver en la tablet.';
  else if (nombre.length > LIMITES_DE_PERSONA.nombre) {
    problemas.nombre = `Hasta ${LIMITES_DE_PERSONA.nombre} letras.`;
  }

  if (b.rol === '') problemas.rol = 'Elegí qué hace.';

  const esDueno = b.rol === 'dueno';
  const telefono = b.telefono.trim();
  if (esDueno && telefono === '') {
    problemas.telefono = 'El dueño entra a su panel con su teléfono.';
  }

  if (b.rol !== '' && !esDueno && b.locales.length === 0) {
    problemas.locales = 'Elegí al menos un local: si no, no aparece en ninguna tablet.';
  }

  const pin = revisarPin(b, b.rol !== '' && !esDueno);
  if (!pin.ok) Object.assign(problemas, pin.problemas);

  if (Object.keys(problemas).length > 0 || !pin.ok || b.rol === '') {
    return { ok: false, problemas };
  }

  const persona = esquemaPersonaNueva.safeParse({
    nombre,
    rol: b.rol,
    telefono: esDueno ? telefono : null,
    locales: b.locales,
  });
  return persona.success
    ? { ok: true, peticion: persona.data, pin: pin.pin }
    : { ok: false, problemas: { nombre: 'Revisá los datos de la persona.' } };
}

/** `+59170012345` → `7001 2345`. Otro país, tal cual. */
export function telefonoParaVer(telefono: string): string {
  const boliviano = /^\+591(\d{4})(\d{4})$/.exec(telefono);
  return boliviano === null ? telefono : `${boliviano[1]} ${boliviano[2]}`;
}

/** Los nombres de sus locales, en el orden de la ficha. */
export function localesDe(persona: PersonaDelAdmin, ficha: FichaDelNegocio): string {
  const nombres = ficha.locales
    .filter((l) => persona.locales.includes(l.id))
    .map((l) => (l.activo ? l.nombre : `${l.nombre} (cerrado)`));
  return nombres.length === 0 ? 'Sin local' : nombres.join(', ');
}

/**
 * Lo que le falta para usar la tablet, dicho como consecuencia: la tablet no
 * explica por qué alguien no está en la lista. Null si no le falta nada, o si
 * es un dueño que no atiende la caja.
 */
export function avisoDePersona(persona: PersonaDelAdmin): string | null {
  if (!persona.activo) return null;
  const atiende = persona.rol !== 'dueno' || persona.locales.length > 0;
  if (!atiende) return null;
  if (persona.locales.length === 0) return 'Sin local: no aparece en ninguna tablet.';
  if (!persona.tiene_pin) return 'Sin PIN: no aparece en la tablet.';
  return null;
}
