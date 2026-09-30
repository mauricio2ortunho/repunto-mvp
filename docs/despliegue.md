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

## 2. Migrar y sembrar, desde tu máquina

Con las dos cadenas en `.env`:

```bash
pnpm exec prisma migrate deploy   # usa DIRECT_URL
pnpm db:seed                      # negocio de demo, también por DIRECT_URL
```

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

| Proyecto          | Root Directory | Framework | Variables                                               |
| ----------------- | -------------- | --------- | ------------------------------------------------------- |
| `repunto-api`     | `apps/api`     | Other     | `DATABASE_URL`, `CLAVE_CIFRADO_SEMILLAS`, `APP_VERSION` |
| `repunto-cliente` | `apps/cliente` | Next.js   | `NEXT_PUBLIC_API_URL`                                   |
| `repunto-panel`   | `apps/panel`   | Next.js   | `NEXT_PUBLIC_API_URL`                                   |

Detalles que importan:

- **`DATABASE_URL` en Vercel es la del pooler (6543).** `DIRECT_URL` no va: en
  Vercel nunca se migra.
- **`CLAVE_CIFRADO_SEMILLAS` tiene que ser distinta de la de `.env.example`**,
  que es de juguete y pública. Generala con
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  Si se pierde, se pierden los códigos de todos los clientes: las semillas
  quedan cifradas con una clave que ya no existe.
- **Región de las funciones:** la más cercana a la base. Con Supabase en São
  Paulo, `gru1`. Cada salto entre región de función y región de base son
  decenas de milisegundos por consulta, y el sellado hace varias.
- `NEXT_PUBLIC_API_URL` es la URL del proyecto de la API, sin barra final.

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

- **Los topes de peticiones no cuentan bien.** Viven en memoria del proceso y
  en serverless cada invocación puede ser otro proceso. Es la deuda de
  `CLAUDE.md` sección 15, y en Vercel pasa de "impreciso" a "casi inútil".
- **No hay trabajos programados.** Vercel no corre procesos largos; los cron de
  la sección 7 necesitan otro diseño (Vercel Cron pegándole a un endpoint
  protegido, o un proceso aparte).
- **Arranque frío.** La primera petición de una instancia arranca Nest entero.
  Para el cajero son unos cientos de milisegundos de más, cada tanto.
- **Los frontends son andamiaje.** Dos páginas que confirman que el contrato
  compartido compila. Las URLs quedan reservadas y el pipeline probado, pero no
  hay pantalla de caja ni app del cliente todavía.
