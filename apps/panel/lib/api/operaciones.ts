import type {
  CodigoDeVinculacion,
  DatosDelLocal,
  DatosDePersona,
  EntradaDelDueno,
  FichaDelNegocio,
  PersonaCreada,
} from '@repunto/contratos';

import type { Respuesta } from './http';

/**
 * Lo que muestran las secciones de locales, personas y tablets: la ficha del
 * admin lo trae entero, y el panel del dueño, lo mismo sin el resto de la
 * ficha.
 */
export type EquipoDelNegocio = Pick<FichaDelNegocio, 'locales' | 'personas' | 'tablets'>;

/**
 * Lo que esas secciones piden a la api. Las mismas pantallas sirven al admin
 * y al dueño; cada uno arma las suyas (`operacionesDelAdmin`,
 * `OPERACIONES_DEL_DUENO`): el admin nombra el negocio en la ruta, el dueño
 * no, porque sale de su sesión. Lo que es null no se ofrece.
 */
export interface OperacionesDelNegocio {
  /** Abrir un local nuevo: solo el admin, que acompaña cada apertura. */
  crearLocal:
    ((datos: DatosDelLocal, clave: string) => Promise<Respuesta<unknown>>) | null;
  /** Cerrar y reabrir: solo el admin. Cerrar por error deja un local sin sellar. */
  cambiarEstadoDelLocal:
    ((local: string, activo: boolean) => Promise<Respuesta<unknown>>) | null;
  guardarLocal(local: string, datos: DatosDelLocal): Promise<Respuesta<unknown>>;
  /** La página del cartel para imprimir. */
  rutaDelQr(local: string): string;

  generarCodigoDeVinculacion(
    local: string,
    clave: string,
  ): Promise<Respuesta<CodigoDeVinculacion>>;
  revocarTablet(tablet: string): Promise<Respuesta<unknown>>;

  /**
   * Si carga, edita y da de baja dueños. El dueño los ve en la lista, sin
   * acciones: a un dueño lo maneja el admin (DUENO_NO_EDITABLE).
   */
  manejaDuenos: boolean;
  /** El código para que un dueño entre a su panel: solo el admin lo da. */
  generarEntradaDelDueno:
    ((persona: string, clave: string) => Promise<Respuesta<EntradaDelDueno>>) | null;
  crearPersona(persona: DatosDePersona, clave: string): Promise<Respuesta<PersonaCreada>>;
  ponerPin(persona: string, pin: string): Promise<Respuesta<unknown>>;
  guardarPersona(persona: string, datos: DatosDePersona): Promise<Respuesta<unknown>>;
  darDeBaja(persona: string): Promise<Respuesta<unknown>>;
  /** `telefono`: solo para el dueño, que se lo liberó al darlo de baja. */
  reactivarPersona(persona: string, telefono: string | null): Promise<Respuesta<unknown>>;
  borrarPersona(persona: string): Promise<Respuesta<unknown>>;
}
