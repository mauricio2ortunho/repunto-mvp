-- Dos personas activas del mismo negocio no pueden llamarse igual.
--
-- En la tablet el nombre es lo que se toca para abrir turno (CLAUDE.md,
-- seccion 5): con dos "Ana", una abre turno como la otra y los sellos quedan
-- firmados por quien no fue. Sin distinguir mayusculas: "ana" y "Ana" se ven
-- igual en la lista. Los dados de baja no chocan: el que se fue no aparece
-- en la tablet, y su nombre puede volver a usarse.
--
-- Prisma no expresa indices sobre expresiones ni parciales: vive aca y en
-- docs/garantias-de-la-base.md.
--
-- Para revertir: DROP INDEX "usuario_negocio_nombre_unico_entre_activos";

CREATE UNIQUE INDEX "usuario_negocio_nombre_unico_entre_activos"
  ON "usuario_negocio" ("negocio_id", lower("nombre"))
  WHERE "activo";
