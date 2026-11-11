import { CA_DE_SUPABASE } from './ca-de-supabase';

/**
 * Como se conecta `pg` a la base, a partir de DATABASE_URL.
 *
 * Con Supabase, verificando el certificado contra su CA (CA_DE_SUPABASE):
 * hasta ahora las cadenas llevaban `sslmode=no-verify`, que cifra pero acepta
 * cualquier certificado, asi que alguien en el camino podia hacerse pasar
 * por la base. Los parametros `ssl*` de la cadena se sacan porque `pg` les da
 * prioridad sobre la opcion `ssl`, y el `no-verify` que esta cargado en
 * Vercel apagaria la verificacion otra vez.
 *
 * Cualquier otra base —el Postgres de Docker, sin SSL— se conecta tal cual.
 */
export interface OpcionesDeConexion {
  connectionString: string;
  ssl?: { ca: string; rejectUnauthorized: true };
}

const PARAMETROS_DE_SSL = [
  'sslmode',
  'sslrootcert',
  'sslcert',
  'sslkey',
  'uselibpqcompat',
];

export function esDeSupabase(host: string): boolean {
  return host.endsWith('.supabase.com') || host.endsWith('.supabase.co');
}

export function opcionesDeConexion(url: string): OpcionesDeConexion {
  let partes: URL;
  try {
    partes = new URL(url);
  } catch {
    return { connectionString: url };
  }
  if (!esDeSupabase(partes.hostname)) return { connectionString: url };
  for (const parametro of PARAMETROS_DE_SSL) partes.searchParams.delete(parametro);
  return {
    connectionString: partes.toString(),
    ssl: { ca: CA_DE_SUPABASE, rejectUnauthorized: true },
  };
}
