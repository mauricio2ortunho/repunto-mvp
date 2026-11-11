import { describe, expect, it } from 'vitest';

import { CA_DE_SUPABASE } from './ca-de-supabase';
import { opcionesDeConexion } from './conexion';

describe('opcionesDeConexion', () => {
  it('con Supabase verifica el certificado y saca el no-verify de la cadena', () => {
    const o = opcionesDeConexion(
      'postgresql://usuario.ref:clave@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=no-verify&pgbouncer=true',
    );
    expect(o.ssl).toEqual({ ca: CA_DE_SUPABASE, rejectUnauthorized: true });
    expect(o.connectionString).not.toContain('sslmode');
    // Lo demas de la cadena queda igual.
    expect(o.connectionString).toContain('pgbouncer=true');
    expect(o.connectionString).toContain(':6543/postgres');
  });

  it('la conexion directa de Supabase tambien', () => {
    const o = opcionesDeConexion(
      'postgresql://postgres:x@db.abc.supabase.co:5432/postgres',
    );
    expect(o.ssl?.rejectUnauthorized).toBe(true);
  });

  it('el Postgres de Docker se conecta tal cual, sin SSL', () => {
    const url = 'postgresql://repunto:repunto_local@localhost:5434/repunto';
    expect(opcionesDeConexion(url)).toEqual({ connectionString: url });
  });

  it('un host que solo se parece a Supabase no recibe la CA', () => {
    const url = 'postgresql://a:b@supabase.com.otro.net:5432/x?sslmode=require';
    expect(opcionesDeConexion(url)).toEqual({ connectionString: url });
  });

  it('la CA es un certificado', () => {
    expect(CA_DE_SUPABASE.startsWith('-----BEGIN CERTIFICATE-----')).toBe(true);
  });
});
