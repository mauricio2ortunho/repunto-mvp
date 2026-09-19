// Lo que el globalSetup (preparar-base.ts) le pasa a los tests con
// project.provide(), y los tests leen con inject().
export {};

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL de la base de tests recien recreada y migrada. */
    urlBaseTest: string;
    /** La clave con la que se cifran las semillas TOTP en esta corrida. */
    claveCifrado: string;
  }
}
