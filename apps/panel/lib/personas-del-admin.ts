import {
  type FichaDelNegocio,
  FORMATO_DEL_PIN,
  LIMITES_DE_PERSONA,
  type PersonaDelAdmin,
  type PersonaNueva,
  ROLES_DE_PERSONA,
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

/**
 * `conPin`: en el alta va el PIN; al editar no, que se cambia con su propio
 * boton.
 */
export function revisarPersona(
  b: BorradorDePersona,
  { conPin }: { conPin: boolean } = { conPin: true },
): RevisionDePersona {
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

  const pin = conPin
    ? revisarPin(b, b.rol !== '' && !esDueno)
    : ({ ok: true, pin: null } as const);
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
export function localesDe(
  persona: PersonaDelAdmin,
  ficha: Pick<FichaDelNegocio, 'locales'>,
): string {
  const nombres = ficha.locales
    .filter((l) => persona.locales.includes(l.id))
    .map((l) => (l.activo ? l.nombre : `${l.nombre} (cerrado)`));
  return nombres.length === 0 ? 'Sin local' : nombres.join(', ');
}

/**
 * Lo que le falta para usar la tablet, dicho como consecuencia: la tablet no
 * explica por qué alguien no está en la lista. Null si no le falta nada, o si
 * es un dueño.
 *
 * Al dueño no se le avisa nunca: atender la caja es opcional para él, y
 * tener locales no quiere decir que la atienda, porque vincular una tablet
 * desde su panel lo asigna a ese local (la firma del código lo exige).
 */
export function avisoDePersona(persona: PersonaDelAdmin): string | null {
  if (!persona.activo || persona.rol === 'dueno') return null;
  if (persona.locales.length === 0) return 'Sin local: no aparece en ninguna tablet.';
  if (!persona.tiene_pin) return 'Sin PIN: no aparece en la tablet.';
  return null;
}

/** Lo que trae el formulario al editar: lo que la persona tiene hoy. */
export function borradorDesdePersona(p: PersonaDelAdmin): BorradorDePersona {
  return {
    ...PERSONA_VACIA,
    nombre: p.nombre,
    rol: p.rol,
    telefono: p.telefono === null ? '' : telefonoParaVer(p.telefono),
    locales: p.locales,
  };
}

/**
 * Los roles que se le pueden elegir. Al alta, todos, menos dueño para quien
 * no maneja dueños (el dueño, en su panel). Al editar, el dueño sigue siendo
 * dueño y los demás van entre supervisor y cajero (ROL_NO_CAMBIABLE).
 */
export function rolesPosibles(
  p: PersonaDelAdmin | null,
  manejaDuenos = true,
): readonly RolDePersona[] {
  if (p === null) {
    return manejaDuenos ? ROLES_DE_PERSONA : ['supervisor', 'cajero'];
  }
  return p.rol === 'dueno' ? ['dueno'] : ['supervisor', 'cajero'];
}

/**
 * Los locales que se ofrecen: los abiertos, y los cerrados que ya tiene, para
 * que guardar no se los saque sin que nadie lo haya pedido.
 */
export function localesParaElegir(
  ficha: Pick<FichaDelNegocio, 'locales'>,
  tiene: readonly string[],
): FichaDelNegocio['locales'] {
  return ficha.locales.filter((l) => l.activo || tiene.includes(l.id));
}
