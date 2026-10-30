# Despliegue

Base de datos en **Supabase**, aplicaciones en **Vercel**. Es un cambio
respecto de `CLAUDE.md` sección 2, que manda la API y la base a Railway: está
anotado ahí con sus consecuencias. Lo que sigue es el orden en que hay que
hacerlo y lo que hay que pegar en cada pantalla.

## 1. Supabase

En **Project Settings → Database** hay dos cadenas de conexión, y las dos se
usan para cosas distintas:

| Cadena                 | Puerto | Para qué                         |
| ---------------------- | ------ | -------------------------------- |
| **Transaction pooler** | 6543   | La aplicación: `DATABASE_URL`    |
| **Direct connection**  | 5432   | Migraciones y seed: `DIRECT_URL` |

El pooler en modo transacción no sostiene los candados de sesión que `prisma
migrate` necesita, así que migrar por el 6543 falla. Al revés, la conexión
directa no aguanta muchas conexiones simultáneas, que es justo lo que hace una
función serverless.

Si la conexión directa no responde desde tu red —Supabase la ofrece solo por
IPv6 en los proyectos nuevos, salvo que se pague IPv4—, usá la cadena del
**Session pooler** (mismo host del pooler, puerto 5432) como `DIRECT_URL`. Esa
sí soporta lo que las migraciones necesitan.

### Verificado contra el proyecto del piloto

Probado con una conexión real, no leyendo el panel:

- **El host del pooler es `aws-0-sa-east-1.pooler.supabase.com`.** Hay otro,
  `aws-1-sa-east-1`, que resuelve igual de bien y contesta
  `Tenant or user not found`: el proyecto está asignado a uno de los dos y no
  se adivina. El usuario del pooler lleva el ref pegado:
  `postgres.<ref>`, no `postgres`.
- **La conexión directa solo tiene registro AAAA.** Funciona desde una red con
  IPv6 y no resuelve en una sin él. Por eso el `Session pooler` es la
  alternativa, no un lujo.
- **El certificado no valida contra las CA del sistema.** Node corta con
  `SELF_SIGNED_CERT_IN_CHAIN`, así que las cadenas que usa la aplicación y el
  seed van con **`sslmode=no-verify`**. El motor de `prisma migrate` no verifica
  la cadena y acepta `sslmode=require`. Está anotado como deuda en `CLAUDE.md`
  sección 15: para producción hay que instalar la CA de Supabase en lugar de
  apagar la verificación.
- **Supabase corre PostgreSQL 17.11**, no 16 como el Docker local. Las
  migraciones se aplican igual, pero dev y staging quedaron en versiones
  distintas. Ver la deuda en `CLAUDE.md` sección 15.

## 2. Migrar y sembrar, desde tu máquina

Las dos cadenas se pasan **en la invocación**, no en `.env`: así `.env` sigue
apuntando al Postgres de Docker y el trabajo diario no cambia de base sin que
nadie se entere, que es exactamente el accidente del puerto 5432 que cuenta
`CLAUDE.md` sección 9.

```bash
# PowerShell
$env:DIRECT_URL = "postgresql://postgres:<clave>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
npx prisma migrate deploy

$env:DATABASE_URL = "postgresql://postgres:<clave>@db.<ref>.supabase.co:5432/postgres?sslmode=no-verify"
$env:CLAVE_CIFRADO_SEMILLAS = "<la misma que va en Vercel>"
pnpm db:seed
```

La clave de cifrado del seed **tiene que ser la misma que la de Vercel**: las
semillas quedan cifradas con ella, y con otra clave los clientes de demo no
pueden generar su código. Si la base ya se sembró con otra clave, alcanza con
volver a correr el seed con la nueva: re-cifra las semillas de los clientes de
demo y no toca nada más.

`migrate deploy` y no `migrate dev`: nunca crea ni edita migraciones, solo
aplica las que ya existen. Y nunca `db push`, que armaría la base desde
`schema.prisma` y se saltearía los índices parciales, los CHECK y los triggers
que viven en el SQL de las migraciones.

El seed imprime al terminar el `qr_slug` del local, el token de la tablet y el
de dos clientes de prueba. **Esos tokens están en el repo**: sirven para probar
desde cualquier dispositivo y no valen para nada más. El seed se niega a correr
con `NODE_ENV=production`.

## 3. Vercel: tres proyectos, un repo

Importar `mauricio2ortunho/repunto-mvp` tres veces, cambiando solo la carpeta
raíz. Cada `vercel.json` ya trae el comando de build correcto, que instala
desde la raíz del monorepo y compila los paquetes compartidos antes de la app.

| Proyecto          | Root Directory | Framework | Variables                                                                                     |
| ----------------- | -------------- | --------- | --------------------------------------------------------------------------------------------- |
| `repunto-api`     | `apps/api`     | Other     | `DATABASE_URL`, `CLAVE_CIFRADO_SEMILLAS`, `ORIGENES_PERMITIDOS`, `APP_VERSION`, `CRON_SECRET` |
| `repunto-cliente` | `apps/cliente` | Next.js   | `NEXT_PUBLIC_API_URL`                                                                         |
| `repunto-panel`   | `apps/panel`   | Next.js   | `NEXT_PUBLIC_API_URL`                                                                         |

Detalles que importan:

- **`DATABASE_URL` en Vercel es la del pooler (6543).** `DIRECT_URL` no va: en
  Vercel nunca se migra.
- **`CLAVE_CIFRADO_SEMILLAS` tiene que ser distinta de la de `.env.example`**,
  que es de juguete y pública. Generala con
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  Si se pierde, se pierden los códigos de todos los clientes: las semillas
  quedan cifradas con una clave que ya no existe.
- **`ORIGENES_PERMITIDOS` no es opcional.** Son las URL de los dos frontends
  separadas por coma. Sin ella la API no arranca en producción, y eso es
  deliberado: si arrancara, el síntoma sería un error de CORS en la consola del
  navegador de alguien, que no menciona ninguna variable de entorno. Para los
  previews del hosting sirve el comodín de subdominio,
  `https://*.vercel.app`, porque cada preview tiene su propia URL. Ojo: el
  comodín también acepta sitios de terceros en ese dominio. Sin cookies el
  riesgo es chico, pero en cuanto se conozca la URL del panel conviene
  reemplazarlo por la URL exacta.
- **Región de las funciones:** la más cercana a la base. Con Supabase en São
  Paulo, `gru1`, y ya está fijada en `apps/api/vercel.json` (`regions`): no
  hay que tocarla en el panel de Vercel. Cada salto entre región de función y región de base son
  decenas de milisegundos por consulta, y el sellado hace varias.
- `NEXT_PUBLIC_API_URL` es la URL del proyecto de la API, sin barra final.
- **No hay token de tablet en el entorno.** Cada tablet obtiene el suyo en
  `/vincular` (sección 3b). Si en el proyecto del panel quedó cargada
  `NEXT_PUBLIC_TOKEN_TABLET` de antes, el build la ignora —solo `next dev` la
  lee— y conviene borrarla igual, para que nadie crea que hace algo.

## 3b. Vincular las tablets de un local

Cada tablet tiene su propia sesión. Se instala así, una vez por tablet:

```bash
# Desde tu máquina, con DATABASE_URL apuntando a la base del entorno
pnpm tablets vincular <qr_del_local> --admin <tu_telefono_de_admin>
```

El script imprime un código de ocho caracteres que vence a los 15 minutos. En
la tablet, abrir el panel en `/vincular`, escribirlo, y la tablet queda
vinculada a ese local y pidiendo turno. `pnpm tablets listar` muestra las
tablets y quién vinculó cada una; `pnpm tablets revocar <id>` da de baja una
perdida, que deja de servir en el pedido siguiente.

`pnpm tablets salud` es el chequeo de salud por local (`CLAUDE.md` sección
8): cuándo selló por última vez cada tablet activa, cuándo intentó algo y
con qué la rechazaron, y qué locales llevan 7 días o más sin sellar. Sin
sellos y sin intentos, el local abandonó el sistema; sin sellos pero con
intentos rechazados, lo están usando y algo lo frena.

El teléfono tiene que ser de un `admin_plataforma` activo. El seed crea uno de
demo, `+59170000000`; para un entorno real, el admin se da de alta a mano una
sola vez.

- `NODE_ENV` no se carga: Vercel ya la pone en `production`.

## 3c. La tarea nocturna

Vercel Cron llama a `GET /tareas/nocturna` una vez por día, a las 04:15 UTC
(00:15 en La Paz). Está declarado en `apps/api/vercel.json` (`crons`): no se
configura en el panel. Vence las tarjetas cuyo `vence_el` ya pasó y purga
`codigo_usado`, `peticion_idempotente` y `tope_peticion` de más de 24 horas.
De paso toca la base todos los días, y con eso Supabase deja de pausar el
proyecto por inactividad.

- **`CRON_SECRET` es obligatoria.** Vercel la manda sola como
  `Authorization: Bearer <CRON_SECRET>` cuando existe en el proyecto. Sin
  ella, o con menos de 32 caracteres, el endpoint responde 503 siempre: nunca
  queda abierto. Generala con
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
  y redesplegá después de cargarla.
- **En el plan Hobby el horario no es exacto:** corre en algún momento entre
  las 04:00 y las 04:59 UTC. No importa: solo vence lo que ya venció.
- **Correrla dos veces no cambia nada**, y dos a la vez tampoco: un candado en
  la base hace que la segunda responda `{"estado":"en-curso"}` sin tocar nada.

Para verla correr sin esperar a la noche, en Vercel: proyecto de la API →
**Settings → Cron Jobs → Run**. El resultado queda en los logs de esa
invocación, una línea JSON con cuántas tarjetas venció y cuánto purgó.

## 4. Verificar

```bash
curl https://<api>.vercel.app/salud
```

Tiene que devolver `{"estado":"ok","version":"...","base":"ok"}`. Si devuelve
**503 con `base: "sin-conexion"`**, la API arrancó pero no puede consultar: es
la cadena de conexión, el SSL o la contraseña, no el código.

Después, el flujo entero desde dos dispositivos, con lo que imprimió el seed:
el teléfono pide su código a `/mi/codigo` y la tablet lo tipea en
`/caja/sellos`.

## Lo que este despliegue todavía no resuelve

- **Los logs de la API duran una hora** en el plan Hobby. Lo que tiene que
  durar —qué pasó en la caja— va a la bitácora `intento_caja`, en la base
  (`CLAUDE.md` sección 8).
- **De los trabajos programados, corre solo la tarea nocturna** (sección 3c).
  Los de aviso al cliente, enfriados y local sin sellos esperan a WhatsApp y
  al panel del dueño; cuando lleguen, son otra entrada en `crons` y otro
  endpoint detrás del mismo guard.
- **Arranque frío.** La primera petición de una instancia arranca Nest entero.
  Para el cajero son unos cientos de milisegundos de más, cada tanto.
- **El certificado de la base no se verifica.** `sslmode=no-verify` acepta
  cualquier certificado, así que alguien en el camino podría hacerse pasar por
  la base. Para staging con datos de demo es aceptable; antes de que haya
  teléfonos de clientes reales hay que instalar la CA de Supabase.
