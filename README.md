# Repunto

Plataforma de fidelizacion. Monorepo pnpm + Turborepo.

El contexto del proyecto vive en [`CLAUDE.md`](./CLAUDE.md) y en
[`docs/`](./docs). Se leen antes de escribir codigo, no despues.

## Arranque

```bash
pnpm install
cp .env.example .env
docker compose up -d       # Postgres 16 local, en el puerto 5434
pnpm db:migrate            # aplica migraciones y genera el cliente de Prisma
pnpm dev                   # api :3001, cliente :3000, panel :3002
```

`GET http://localhost:3001/salud` devuelve estado y version.

## Comandos

| Comando                 | Que hace                                                                    |
| ----------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`              | Levanta las tres apps                                                       |
| `pnpm --filter api dev` | Solo la api                                                                 |
| `pnpm build`            | Compila packages y apps                                                     |
| `pnpm test`             | Unitarios (Vitest)                                                          |
| `pnpm test:integration` | Recrea `repunto_test`, la migra y corre la integracion contra Postgres real |
| `pnpm typecheck`        | TypeScript strict en todo el monorepo                                       |
| `pnpm lint`             | ESLint + Prettier                                                           |
| `pnpm db:migrate`       | `prisma migrate dev` + `prisma generate`                                    |
| `pnpm db:generate`      | Solo regenera el cliente de Prisma                                          |
| `pnpm db:seed`          | Negocio de demo idempotente; imprime los tokens para probar                 |

Los tests de integracion levantan la api de verdad y hablan HTTP contra ella,
asi que necesitan Postgres arriba y las variables de `.env`.

## Despliegue

Base en Supabase, apps en Vercel. El procedimiento, las variables de cada
proyecto y lo que este despliegue todavia no resuelve estan en
[`docs/despliegue.md`](./docs/despliegue.md).

## Base de datos

Postgres corre en el **5434**, no en el 5432: en Windows es comun tener un
PostgreSQL nativo o el contenedor de otro proyecto ocupando los puertos
habituales, y Prisma terminaria hablando con esa base sin avisar.

El esquema esta en `prisma/schema.prisma`. Parte de las garantias vive en SQL
crudo dentro de la migracion (indices parciales y CHECK) y en FK compuestas;
leer `CLAUDE.md`, seccion 14, antes de tocarlo.

## Estado

Funciona el mostrador completo, de punta a punta y con tests de integracion
contra Postgres real:

- **Sellado y canje.** El cliente muestra `K7Q4M-418329` —prefijo estable mas
  TOTP de 30 segundos—, el cajero lo tipea, y todo ocurre en una transaccion.
- **Alta del cliente.** Escanea el QR del local, queda pendiente en la lista de
  la caja y el cajero lo confirma, con o sin sello en el mismo acto.
- **Anulacion.** Cinco minutos para el cajero sobre su ultimo sello; el
  supervisor, cualquiera de su local. Marca, nunca borra.

Las reglas de negocio viven en `packages/dominio`, en funciones puras que
reciben el reloj por parametro y devuelven decisiones; `apps/api` las ejecuta.
Lo que garantiza la base, restriccion por restriccion, esta en
[`docs/garantias-de-la-base.md`](./docs/garantias-de-la-base.md), y un test
falla si el documento y el esquema dejan de coincidir.

Lo que falta —verificacion del telefono por codigo, los trabajos programados,
el log estructurado y los frontends— esta anotado en `CLAUDE.md`, seccion 15,
con el motivo de cada cosa.
