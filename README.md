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
| `pnpm db:seed`          | Falla: el seed todavia no existe                                            |

## Base de datos

Postgres corre en el **5434**, no en el 5432: en Windows es comun tener un
PostgreSQL nativo o el contenedor de otro proyecto ocupando los puertos
habituales, y Prisma terminaria hablando con esa base sin avisar.

El esquema esta en `prisma/schema.prisma`. Parte de las garantias vive en SQL
crudo dentro de la migracion (indices parciales y CHECK) y en FK compuestas;
leer `CLAUDE.md`, seccion 14, antes de tocarlo.

## Estado

Esquema, migraciones y tests de integracion del esquema. Lo que garantiza la
base esta en `docs/garantias-de-la-base.md`. Sin logica de negocio, sin
repositorios y sin endpoints de producto.
