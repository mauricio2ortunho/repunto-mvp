import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vencimientoDesde } from '@repunto/dominio';
import { Client } from 'pg';

import { cifrarSemilla } from '../src/seguridad/cifrado.ts';
import { hashDeToken } from '../src/seguridad/token.ts';

/**
 * Negocio de demo con datos ficticios (CLAUDE.md, seccion 9): sirve para
 * mostrarle la app a un negocio que todavia no tiene clientes, y para probar
 * el flujo entero desde cualquier dispositivo sin tocar la base a mano.
 *
 * Es idempotente. Todas las filas tienen id fijo y se insertan con
 * `ON CONFLICT (id) DO NOTHING`, asi que correrlo dos veces no cambia nada y
 * no borra nada: ni un DELETE, ni un TRUNCATE (INV-17).
 *
 * Una excepcion, a proposito: la semilla TOTP de los clientes de demo se
 * vuelve a cifrar en cada corrida, con la CLAVE_CIFRADO_SEMILLAS del entorno.
 * Sin eso, una base sembrada con una clave queda atada a ella para siempre:
 * se despliega la api con la clave de verdad, no puede descifrar las
 * semillas, y los clientes de demo no pueden generar su codigo. Las semillas
 * de demo estan en este archivo y son publicas, asi que re-cifrarlas no
 * expone nada. Ninguna otra fila se toca.
 *
 * LOS TOKENS DE ESTE ARCHIVO SON PUBLICOS. Estan a la vista para poder tipear
 * una prueba desde un telefono. Un negocio real nunca se da de alta con esto:
 * el script se niega a correr con NODE_ENV=production.
 *
 * Se corre con `pnpm db:seed`. Node 24 ejecuta este TypeScript sin compilarlo.
 */

/** Ids fijos: son lo que hace idempotente al seed. */
const ID = {
  negocio: '11111111-1111-4111-8111-000000000001',
  equipetrol: '11111111-1111-4111-8111-000000000002',
  centro: '11111111-1111-4111-8111-000000000003',
  dueno: '11111111-1111-4111-8111-000000000004',
  cajera: '11111111-1111-4111-8111-000000000005',
  supervisor: '11111111-1111-4111-8111-000000000006',
  tabletEquipetrol: '11111111-1111-4111-8111-000000000007',
  tabletCentro: '11111111-1111-4111-8111-000000000008',
  turno: '11111111-1111-4111-8111-000000000009',
  programa: '11111111-1111-4111-8111-00000000000a',
  condicion: '11111111-1111-4111-8111-00000000000b',
  juan: '11111111-1111-4111-8111-00000000000c',
  ana: '11111111-1111-4111-8111-00000000000d',
  sesionJuan: '11111111-1111-4111-8111-00000000000e',
  sesionAna: '11111111-1111-4111-8111-00000000000f',
  tarjetaJuan: '11111111-1111-4111-8111-000000000010',
  sellosDeJuan: [
    '11111111-1111-4111-8111-000000000011',
    '11111111-1111-4111-8111-000000000012',
    '11111111-1111-4111-8111-000000000013',
  ],
} as const;

const RAIZ = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DIA = 86_400_000;

/** Tokens en claro. Publicos a proposito: ver el aviso de arriba. */
const TOKEN = {
  tabletEquipetrol: 'demo-tablet-equipetrol',
  tabletCentro: 'demo-tablet-centro',
  juan: 'demo-cliente-juan',
  ana: 'demo-cliente-ana',
} as const;

const QR = {
  equipetrol: 'demo-equipetrol',
  centro: 'demo-centro',
} as const;

/** Prefijo que el cliente muestra en caja. Sin caracteres ambiguos. */
const CODIGO_PUBLICO = { juan: 'JUAN2', ana: 'ANA22' } as const;

/** Semillas TOTP de demo, en base32. Se guardan cifradas y nunca se imprimen. */
const SEMILLA = { juan: 'JBSWY3DPEHPK3PXP', ana: 'KRSXG5CTMVRXEZLU' } as const;

async function sembrar(): Promise<void> {
  // Relativo al repo, no al directorio desde donde se invoque.
  const env = resolve(RAIZ, '.env');
  if (existsSync(env)) process.loadEnvFile(env);

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'El seed no corre en produccion: sus tokens son publicos y estan en el repo.',
    );
  }
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('Falta DATABASE_URL.');

  const db = new Client({ connectionString: url });
  await db.connect();

  try {
    await db.query('BEGIN');

    await db.query(
      `INSERT INTO negocio (id, nombre, categoria, color_principal, plantilla_tarjeta,
                            icono_sello, canje_cualquier_local)
       VALUES ($1, 'Cafe Repunto', 'cafe', '#2E5D4B', 'clasica', 'cafe', true)
       ON CONFLICT (id) DO NOTHING`,
      [ID.negocio],
    );

    for (const [id, nombre, direccion, qr] of [
      [ID.equipetrol, 'Equipetrol', 'Av. San Martin 200', QR.equipetrol],
      [ID.centro, 'Centro', 'Calle Sucre 45', QR.centro],
    ] as const) {
      await db.query(
        `INSERT INTO local (id, negocio_id, nombre, direccion, qr_slug)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [id, ID.negocio, nombre, direccion, qr],
      );
    }

    // El dueño entra por telefono; la cajera y el supervisor, por PIN sobre la
    // tablet. El pin_hash queda nulo: abrir turno todavia no existe como
    // endpoint, asi que inventar un esquema de hash aca seria adivinar.
    for (const [id, rol, telefono, nombre] of [
      [ID.dueno, 'dueno', '+59170000001', 'Rocio (dueña)'],
      [ID.cajera, 'cajero', null, 'Marta'],
      [ID.supervisor, 'supervisor', null, 'Diego'],
    ] as const) {
      await db.query(
        `INSERT INTO usuario_negocio (id, negocio_id, rol, telefono, nombre)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [id, ID.negocio, rol, telefono, nombre],
      );
    }

    // El dueño tambien va asignado a Equipetrol: sin asignacion no puede
    // vincular una tablet ni anular desde la caja (CLAUDE.md, seccion 14).
    for (const [usuario, local] of [
      [ID.cajera, ID.equipetrol],
      [ID.supervisor, ID.equipetrol],
      [ID.supervisor, ID.centro],
      [ID.dueno, ID.equipetrol],
    ] as const) {
      await db.query(
        `INSERT INTO usuario_local (usuario_id, local_id, negocio_id)
         VALUES ($1, $2, $3) ON CONFLICT (usuario_id, local_id) DO NOTHING`,
        [usuario, local, ID.negocio],
      );
    }

    for (const [id, local, nombre, token] of [
      [ID.tabletEquipetrol, ID.equipetrol, 'Caja 1', TOKEN.tabletEquipetrol],
      [ID.tabletCentro, ID.centro, 'Caja 1', TOKEN.tabletCentro],
    ] as const) {
      await db.query(
        `INSERT INTO dispositivo_caja (id, local_id, nombre, token_hash, vinculado_el)
         VALUES ($1, $2, $3, $4, now()) ON CONFLICT (id) DO NOTHING`,
        [id, local, nombre, hashDeToken(token)],
      );
    }

    // Turno abierto de Marta en la tablet de Equipetrol: sin turno, la caja
    // responde TURNO_CERRADO a todo.
    await db.query(
      `INSERT INTO turno_caja (id, dispositivo_id, usuario_id, local_id, abierto_el)
       VALUES ($1, $2, $3, $4, now()) ON CONFLICT (id) DO NOTHING`,
      [ID.turno, ID.tabletEquipetrol, ID.cajera, ID.equipetrol],
    );

    await db.query(
      `INSERT INTO programa (id, negocio_id, version, sellos_requeridos, premio,
                             vigencia_meses, horas_entre_sellos, vigente)
       VALUES ($1, $2, 1, 10, 'Un cafe gratis', 1, 4, true)
       ON CONFLICT (id) DO NOTHING`,
      [ID.programa, ID.negocio],
    );

    await db.query(
      `INSERT INTO condicion_sello (id, negocio_id, texto, vigente_desde, usuario_id)
       VALUES ($1, $2, 'Cualquier cafe o capuchino', now(), $3)
       ON CONFLICT (id) DO NOTHING`,
      [ID.condicion, ID.negocio, ID.dueno],
    );

    for (const [id, telefono, nombre, codigo, semilla] of [
      [ID.juan, '+59170000010', 'Juan', CODIGO_PUBLICO.juan, SEMILLA.juan],
      [ID.ana, '+59170000011', 'Ana', CODIGO_PUBLICO.ana, SEMILLA.ana],
    ] as const) {
      await db.query(
        `INSERT INTO cliente (id, telefono, nombre, semilla_totp, codigo_publico,
                              telefono_verificado)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET semilla_totp = EXCLUDED.semilla_totp`,
        [id, telefono, nombre, cifrarSemilla(semilla), codigo],
      );
    }

    for (const [id, cliente, token] of [
      [ID.sesionJuan, ID.juan, TOKEN.juan],
      [ID.sesionAna, ID.ana, TOKEN.ana],
    ] as const) {
      await db.query(
        `INSERT INTO dispositivo_cliente (id, cliente_id, token_hash, ultimo_acceso, origen)
         VALUES ($1, $2, $3, now(), 'codigo') ON CONFLICT (id) DO NOTHING`,
        [id, cliente, hashDeToken(token)],
      );
    }

    // Juan llega con tres sellos: alcanza para ver progreso en pantalla y para
    // que el intervalo minimo de cuatro horas no frene el proximo.
    //
    // El vencimiento lo calcula el dominio, no un `interval '1 month'` de SQL:
    // INV-13 es fin del dia en La Paz, que no es fin del dia en UTC.
    const relojDesde = new Date(Date.now() - ID.sellosDeJuan.length * 2 * DIA);
    await db.query(
      `INSERT INTO tarjeta (id, cliente_id, programa_id, negocio_id, local_alta_id,
                            reloj_desde, vence_el)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [
        ID.tarjetaJuan,
        ID.juan,
        ID.programa,
        ID.negocio,
        ID.equipetrol,
        relojDesde,
        vencimientoDesde(relojDesde, 1),
      ],
    );

    for (const [i, sello] of ID.sellosDeJuan.entries()) {
      await db.query(
        `INSERT INTO sello (id, tarjeta_id, negocio_id, local_id, turno_id, condicion_id, creado_el)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
        [
          sello,
          ID.tarjetaJuan,
          ID.negocio,
          ID.equipetrol,
          ID.turno,
          ID.condicion,
          new Date(relojDesde.getTime() + i * 2 * DIA),
        ],
      );
    }

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

function resumen(): void {
  const base = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
  console.log(`
  Negocio de demo listo: Cafe Repunto, dos locales, promo de 10 sellos.

  QR impreso del mostrador
    Equipetrol  ${QR.equipetrol}
    Centro      ${QR.centro}

  Tokens de las tablets (cabecera Authorization: Bearer ...)
    Equipetrol  ${TOKEN.tabletEquipetrol}   (turno abierto de Marta)
    Centro      ${TOKEN.tabletCentro}       (sin turno: responde TURNO_CERRADO)

  Tokens de los clientes
    Juan  ${TOKEN.juan}     codigo ${CODIGO_PUBLICO.juan}, ${ID.sellosDeJuan.length} sellos
    Ana   ${TOKEN.ana}      codigo ${CODIGO_PUBLICO.ana}, sin tarjeta

  Probar desde dos dispositivos, con el telefono y la tablet:

    1. En el telefono, el codigo que Juan muestra en caja:
       curl ${base}/mi/codigo -H "Authorization: Bearer ${TOKEN.juan}"

    2. En la tablet, tipear ese codigo:
       curl -X POST ${base}/caja/sellos \\
         -H "Authorization: Bearer ${TOKEN.tabletEquipetrol}" \\
         -H "Idempotency-Key: prueba-desde-la-tablet-1" \\
         -H "Content-Type: application/json" \\
         -d '{"codigo":"${CODIGO_PUBLICO.juan}-123456"}'

    3. Darse de alta escaneando el QR:
       curl -X POST ${base}/registros -H "Content-Type: application/json" \\
         -d '{"qr_slug":"${QR.equipetrol}","telefono":"70123456","nombre":"Pedro"}'

  Los tokens son publicos y viven en el repo: esto es demo, nunca produccion.
`);
}

await sembrar();
resumen();
