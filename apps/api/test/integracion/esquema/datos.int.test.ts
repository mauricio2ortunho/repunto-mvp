import { describe } from 'vitest';

import { esperarAceptacion, esperarRechazo, test } from '../base';
import {
  type Escenario,
  codigoPublico,
  crearNegocio,
  escenario,
  telefono,
  unico,
} from '../escenario';

describe('INV-9 · un codigo rotativo se consume una sola vez', () => {
  const CONSUMIR =
    'INSERT INTO codigo_usado (cliente_id, ventana, negocio_id) VALUES ($1, $2, $3)';
  const VENTANA = 59_600_000;

  test('INV-9 · rechaza consumir el mismo codigo dos veces en el mismo negocio', async ({
    db,
  }) => {
    const { a, cliente } = await escenario(db);
    await db.query(CONSUMIR, [cliente, VENTANA, a.id]);
    await esperarRechazo(db, 'codigo_usado_pkey', CONSUMIR, [cliente, VENTANA, a.id]);
  });

  test('INV-9 · rechaza consumir el mismo codigo en otro negocio: el unico es global', async ({
    db,
  }) => {
    const { a, b, cliente } = await escenario(db);
    await db.query(CONSUMIR, [cliente, VENTANA, a.id]);
    await esperarRechazo(db, 'codigo_usado_pkey', CONSUMIR, [cliente, VENTANA, b.id]);
  });

  test('INV-9 · acepta la ventana siguiente del mismo cliente', async ({ db }) => {
    const { a, cliente } = await escenario(db);
    await db.query(CONSUMIR, [cliente, VENTANA, a.id]);
    await esperarAceptacion(db, CONSUMIR, [cliente, VENTANA + 1, a.id]);
  });

  test('INV-9 · rechaza una ventana negativa', async ({ db }) => {
    const { a, cliente } = await escenario(db);
    await esperarRechazo(db, 'codigo_usado_ventana_no_negativa_chk', CONSUMIR, [
      cliente,
      -1,
      a.id,
    ]);
  });
});

describe('INV-20 · telefono en E.164, unico a nivel global', () => {
  const CLIENTE = `INSERT INTO cliente (telefono, nombre, semilla_totp, codigo_publico)
                   VALUES ($1, 'Ana', 's', $2)`;
  const ADMIN = `INSERT INTO admin_plataforma (telefono, nombre) VALUES ($1, 'Admin')`;

  test('INV-20 · rechaza dos clientes con el mismo telefono', async ({ db }) => {
    const tel = telefono();
    await db.query(CLIENTE, [tel, codigoPublico()]);
    await esperarRechazo(db, 'cliente_telefono_key', CLIENTE, [tel, codigoPublico()]);
  });

  test.for([
    ['sin prefijo de pais', '71234567'],
    ['con espacios', '+591 7123 4567'],
    ['con guiones', '+591-71234567'],
    ['empezando en cero', '+0591712345'],
  ])('INV-20 · rechaza un telefono de cliente %s', async ([, tel], { db }) => {
    await esperarRechazo(db, 'cliente_telefono_e164_chk', CLIENTE, [
      tel,
      codigoPublico(),
    ]);
  });

  test('INV-20 · rechaza dos administradores con el mismo telefono', async ({ db }) => {
    const tel = telefono();
    await db.query(ADMIN, [tel]);
    await esperarRechazo(db, 'admin_plataforma_telefono_key', ADMIN, [tel]);
  });

  test('INV-20 · rechaza un telefono de administrador sin normalizar', async ({ db }) => {
    await esperarRechazo(db, 'admin_plataforma_telefono_e164_chk', ADMIN, ['71234567']);
  });

  test('INV-20 · rechaza un telefono de usuario de panel sin normalizar', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'usuario_negocio_telefono_e164_chk',
      `INSERT INTO usuario_negocio (negocio_id, rol, telefono, nombre) VALUES ($1, 'supervisor', '71234567', 'x')`,
      [a.id],
    );
  });
});

describe('Codigo publico del cliente', () => {
  const CLIENTE = `INSERT INTO cliente (telefono, nombre, semilla_totp, codigo_publico)
                   VALUES ($1, 'Ana', 's', $2)`;

  test('Codigo publico · rechaza dos clientes con el mismo codigo', async ({ db }) => {
    const codigo = codigoPublico();
    await db.query(CLIENTE, [telefono(), codigo]);
    await esperarRechazo(db, 'cliente_codigo_publico_key', CLIENTE, [telefono(), codigo]);
  });

  test.for([
    ['en minusculas', 'k7q4m'],
    ['corto', 'K7Q4'],
    ['largo', 'K7Q4MN'],
    ['con la letra O, que se confunde con el cero', 'K7Q4O'],
    ['con el digito 1, que se confunde con la I', 'K7Q41'],
    ['con un guion adentro', 'K7Q-M'],
  ])('Codigo publico · rechaza uno %s', async ([, codigo], { db }) => {
    await esperarRechazo(db, 'cliente_codigo_publico_formato_chk', CLIENTE, [
      telefono(),
      codigo,
    ]);
  });
});

describe('Seccion 5 · el dueno entra por telefono; supervisor y cajero, por PIN', () => {
  const USUARIO = `INSERT INTO usuario_negocio (negocio_id, rol, telefono, nombre) VALUES ($1, $2, $3, 'x')`;

  test('Seccion 5 · rechaza un dueno sin telefono', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(db, 'usuario_negocio_dueno_con_telefono_chk', USUARIO, [
      a.id,
      'dueno',
      null,
    ]);
  });

  test('INV-20 · rechaza el mismo telefono para dos usuarios, aunque sean de negocios distintos', async ({
    db,
  }) => {
    const { b } = await escenario(db);
    const tel = telefono();
    await db.query(USUARIO, [b.id, 'supervisor', tel]);
    const otro = await crearNegocio(db);
    await esperarRechazo(db, 'usuario_negocio_telefono_key', USUARIO, [
      otro.id,
      'dueno',
      tel,
    ]);
  });

  test('Seccion 5 · acepta varios cajeros sin telefono: los nulos no chocan', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarAceptacion(db, USUARIO, [a.id, 'cajero', null]);
    await esperarAceptacion(db, USUARIO, [a.id, 'cajero', null]);
  });
});

describe('Diseno de la tarjeta', () => {
  const NEGOCIO = `
    INSERT INTO negocio (nombre, categoria, color_principal, plantilla_tarjeta, icono_sello)
    VALUES ('Nuevo', 'cafe', $1, $2, $3)`;

  test('Diseno · rechaza una plantilla que no existe', async ({ db }) => {
    await esperarRechazo(db, 'negocio_plantilla_tarjeta_chk', NEGOCIO, [
      '#000000',
      'retro',
      'cafe',
    ]);
  });

  test('Diseno · rechaza un icono de sello que no existe', async ({ db }) => {
    await esperarRechazo(db, 'negocio_icono_sello_chk', NEGOCIO, [
      '#000000',
      'clasica',
      'pizza',
    ]);
  });

  test.for([
    ['un nombre de color', 'rojo'],
    ['hex corto', '#FFF'],
    ['hex sin numeral', 'FFCC00'],
  ])('Diseno · rechaza un color principal que es %s', async ([, color], { db }) => {
    await esperarRechazo(db, 'negocio_color_principal_hex_chk', NEGOCIO, [
      color,
      'clasica',
      'cafe',
    ]);
  });

  test('Diseno · acepta un negocio sin logo ni portada: el alta se hace antes de tenerlos', async ({
    db,
  }) => {
    await esperarAceptacion(db, NEGOCIO, ['#FFCC00', 'moderna', 'estrella']);
  });
});

describe('Cordura y unicidad operativa', () => {
  test('Cordura · rechaza una condicion con monto minimo negativo', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'condicion_sello_monto_minimo_no_negativo_chk',
      `INSERT INTO condicion_sello (negocio_id, texto, monto_minimo, vigente_desde, usuario_id)
       VALUES ($1, 'Compra mayor a', -50, now(), $2)`,
      [a.id, a.dueno],
    );
  });

  test('Cordura · rechaza cerrar un turno antes de abrirlo', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'turno_caja_cierre_posterior_chk',
      `UPDATE turno_caja SET cerrado_el = abierto_el - interval '1 minute' WHERE id = $1`,
      [a.turno],
    );
  });

  test('Cordura · rechaza revocar una tablet antes de vincularla', async ({ db }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'dispositivo_caja_revocado_posterior_chk',
      `UPDATE dispositivo_caja SET revocado_el = vinculado_el - interval '1 day' WHERE id = $1`,
      [a.dispositivo],
    );
  });

  test('Modelo · rechaza dos locales con el mismo QR', async ({ db }) => {
    const a = await crearNegocio(db);
    const slug = unico('qr');
    const LOCAL = `INSERT INTO local (negocio_id, nombre, direccion, qr_slug) VALUES ($1, 'x', 'y', $2)`;
    await db.query(LOCAL, [a.id, slug]);
    await esperarRechazo(db, 'local_qr_slug_key', LOCAL, [a.id, slug]);
  });

  test('Seccion 5 · rechaza dos tablets con el mismo token de sesion', async ({ db }) => {
    const a = await crearNegocio(db);
    const token = unico('token');
    const TABLET = `INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el) VALUES ($1, 'x', $2, now())`;
    await db.query(TABLET, [a.local, token]);
    await esperarRechazo(db, 'dispositivo_caja_token_hash_key', TABLET, [
      a.otroLocal,
      token,
    ]);
  });

  test('INV-2 · rechaza dos turnos abiertos en la misma tablet', async ({ db }) => {
    const a = await crearNegocio(db);
    // El escenario ya dejo un turno abierto del cajero en esa tablet. El
    // supervisor tambien esta asignado a ese local, asi que la fila es valida
    // salvo por el indice parcial.
    await esperarRechazo(
      db,
      'turno_caja_uno_abierto_por_dispositivo',
      `INSERT INTO turno_caja (dispositivo_id, usuario_id, local_id, abierto_el)
       VALUES ($1, $2, $3, now())`,
      [a.dispositivo, a.supervisor, a.local],
    );
  });

  test('INV-2 · acepta el turno siguiente cuando el anterior ya se cerro', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await db.query('UPDATE turno_caja SET cerrado_el = now() WHERE id = $1', [a.turno]);
    await esperarAceptacion(
      db,
      `INSERT INTO turno_caja (dispositivo_id, usuario_id, local_id, abierto_el)
       VALUES ($1, $2, $3, now())`,
      [a.dispositivo, a.supervisor, a.local],
    );
  });

  test('Seccion 9 · rechaza guardar dos veces la misma clave de idempotencia', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    const PETICION = `INSERT INTO peticion_idempotente (dispositivo_id, clave, endpoint, huella_peticion)
                      VALUES ($1, 'clave-de-prueba', 'POST /caja/sellos', 'huella')`;
    await db.query(PETICION, [a.dispositivo]);
    await esperarRechazo(db, 'peticion_idempotente_pkey', PETICION, [a.dispositivo]);
  });

  test('Seccion 9 · acepta la misma clave en otro endpoint: es otra peticion', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await db.query(
      `INSERT INTO peticion_idempotente (dispositivo_id, clave, endpoint, huella_peticion)
       VALUES ($1, 'clave-de-prueba', 'POST /caja/sellos', 'huella')`,
      [a.dispositivo],
    );
    await esperarAceptacion(
      db,
      `INSERT INTO peticion_idempotente (dispositivo_id, clave, endpoint, huella_peticion)
       VALUES ($1, 'clave-de-prueba', 'POST /caja/canjes', 'huella')`,
      [a.dispositivo],
    );
  });

  test('Seccion 9 · rechaza una clave de idempotencia demasiado corta', async ({
    db,
  }) => {
    const a = await crearNegocio(db);
    await esperarRechazo(
      db,
      'peticion_idempotente_clave_razonable_chk',
      `INSERT INTO peticion_idempotente (dispositivo_id, clave, endpoint, huella_peticion)
       VALUES ($1, '1', 'POST /caja/sellos', 'huella')`,
      [a.dispositivo],
    );
  });

  test('Seccion 5 · rechaza dos equipos de cliente con el mismo token', async ({
    db,
  }) => {
    const { cliente } = await escenario(db);
    const token = unico('token');
    const EQUIPO = `INSERT INTO dispositivo_cliente (cliente_id, token_hash, ultimo_acceso) VALUES ($1, $2, now())`;
    await db.query(EQUIPO, [cliente, token]);
    await esperarRechazo(db, 'dispositivo_cliente_token_hash_key', EQUIPO, [
      cliente,
      token,
    ]);
  });
});

describe('INV-17 · FK simples: nada apunta a un padre que no existe', () => {
  // Cada caso apunta a un padre inexistente en UNA sola columna; el resto de
  // la fila es valido, asi que salta exactamente esa FK.
  const INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  test.for([
    [
      'tarjeta_cliente_id_fkey',
      `INSERT INTO tarjeta (cliente_id, programa_id, negocio_id, local_alta_id) VALUES ($1, $2, $3, $4)`,
      (e: Escenario) => [INEXISTENTE, e.a.programa, e.a.id, e.a.local],
    ],
    [
      'codigo_usado_cliente_id_fkey',
      'INSERT INTO codigo_usado (cliente_id, ventana, negocio_id) VALUES ($1, 1, $2)',
      (e: Escenario) => [INEXISTENTE, e.a.id],
    ],
    [
      'codigo_usado_negocio_id_fkey',
      'INSERT INTO codigo_usado (cliente_id, ventana, negocio_id) VALUES ($1, 1, $2)',
      (e: Escenario) => [e.cliente, INEXISTENTE],
    ],
    [
      'dispositivo_cliente_cliente_id_fkey',
      'INSERT INTO dispositivo_cliente (cliente_id, token_hash, ultimo_acceso) VALUES ($1, $2, now())',
      () => [INEXISTENTE, unico('token')],
    ],
    [
      'dispositivo_caja_local_id_fkey',
      `INSERT INTO dispositivo_caja (local_id, nombre, token_hash, vinculado_el) VALUES ($1, 'x', $2, now())`,
      () => [INEXISTENTE, unico('token')],
    ],
    [
      'programa_negocio_id_fkey',
      `INSERT INTO programa (negocio_id, version, sellos_requeridos, premio, horas_entre_sellos, vigente)
       VALUES ($1, 1, 10, 'x', 4, true)`,
      () => [INEXISTENTE],
    ],
    [
      'usuario_negocio_negocio_id_fkey',
      `INSERT INTO usuario_negocio (negocio_id, rol, nombre) VALUES ($1, 'cajero', 'x')`,
      () => [INEXISTENTE],
    ],
    [
      'peticion_idempotente_dispositivo_id_fkey',
      `INSERT INTO peticion_idempotente (dispositivo_id, clave, endpoint, huella_peticion)
       VALUES ($1, 'clave-de-prueba', 'POST /caja/sellos', 'huella')`,
      () => [INEXISTENTE],
    ],
  ] as const)(
    'INV-17 · rechaza una fila que apunta a un padre inexistente (%s)',
    async ([restriccion, sql, parametros], { db }) => {
      const e = await escenario(db);
      await esperarRechazo(db, restriccion, sql, parametros(e));
    },
  );
});
