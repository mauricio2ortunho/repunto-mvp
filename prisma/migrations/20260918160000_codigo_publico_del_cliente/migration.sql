-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "codigo_publico" TEXT NOT NULL;
-- CreateIndex
CREATE UNIQUE INDEX "cliente_codigo_publico_key" ON "cliente"("codigo_publico");

-- ===========================================================================
-- Restriccion que Prisma no sabe expresar. Inventario: docs/garantias-de-la-base.md.
-- ===========================================================================

-- Alfabeto sin caracteres ambiguos: A-Z sin I, L, O ni S; digitos 2-9 sin 5. A
-- un metro del mostrador y con el brillo alto, esos se confunden. Siempre en
-- mayusculas: normalizar es tarea del borde de la API, esto es la red.
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_codigo_publico_formato_chk"
  CHECK ("codigo_publico" ~ '^[A-HJKMNP-RT-Z2-46-9]{5}$');
