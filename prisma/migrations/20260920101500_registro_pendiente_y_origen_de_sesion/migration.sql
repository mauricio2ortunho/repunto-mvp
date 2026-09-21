-- CreateEnum
CREATE TYPE "estado_registro" AS ENUM ('pendiente', 'confirmado', 'descartado');

-- CreateEnum
CREATE TYPE "origen_sesion" AS ENUM ('presencial', 'codigo');

-- AlterTable
-- El DEFAULT existe solo para las filas que ya estuvieran: se marca
-- 'presencial', que es el origen mas debil, para que la futura revocacion por
-- verificacion las alcance. Despues se quita, porque cada sesion nueva tiene
-- que declarar de donde sale.
ALTER TABLE "dispositivo_cliente" ADD COLUMN "origen" "origen_sesion" NOT NULL DEFAULT 'presencial';
ALTER TABLE "dispositivo_cliente" ALTER COLUMN "origen" DROP DEFAULT;

-- CreateTable
CREATE TABLE "registro_pendiente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "local_id" UUID NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ticket_hash" TEXT NOT NULL,
    "estado" "estado_registro" NOT NULL DEFAULT 'pendiente',
    "cliente_id" UUID,
    "cliente_creado" BOOLEAN,
    "resuelto_el" TIMESTAMPTZ(3),
    "resuelto_turno_id" UUID,
    "sesion_entregada_el" TIMESTAMPTZ(3),
    "expira_el" TIMESTAMPTZ(3) NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registro_pendiente_ticket_hash_key" ON "registro_pendiente"("ticket_hash");

-- CreateIndex
CREATE INDEX "registro_pendiente_local_id_estado_creado_el_idx" ON "registro_pendiente"("local_id", "estado", "creado_el");

-- AddForeignKey
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "local"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_turno_mismo_local_fkey" FOREIGN KEY ("resuelto_turno_id", "local_id") REFERENCES "turno_caja"("id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar.
-- Inventario: docs/garantias-de-la-base.md.
-- ===========================================================================

-- Un solo pendiente por telefono y local. Si el cliente toca "enviar" tres
-- veces, la lista del cajero no se llena de repetidos: se actualiza el mismo.
-- Los ya resueltos no chocan, asi que alguien puede registrarse de nuevo
-- manana.
CREATE UNIQUE INDEX "registro_pendiente_uno_por_telefono_y_local"
  ON "registro_pendiente" ("telefono", "local_id")
  WHERE "estado" = 'pendiente';

-- INV-20: el telefono se guarda normalizado, tambien antes de ser cliente.
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_telefono_e164_chk"
  CHECK ("telefono" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_expira_posterior_chk"
  CHECK ("expira_el" > "creado_el");

-- Un registro resuelto sabe quien y cuando, y si se confirmo sabe ademas a que
-- cuenta y si esa cuenta nacio ahi. Sin esto, un UPDATE a medias dejaria un
-- confirmado sin cliente, o un pendiente con rastros de resolucion.
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_resolucion_coherente_chk"
  CHECK (
    ("estado" = 'pendiente' AND "resuelto_el" IS NULL AND "resuelto_turno_id" IS NULL
      AND "cliente_id" IS NULL AND "cliente_creado" IS NULL)
    OR ("estado" = 'descartado' AND "resuelto_el" IS NOT NULL AND "resuelto_turno_id" IS NOT NULL
      AND "cliente_id" IS NULL AND "cliente_creado" IS NULL)
    OR ("estado" = 'confirmado' AND "resuelto_el" IS NOT NULL AND "resuelto_turno_id" IS NOT NULL
      AND "cliente_id" IS NOT NULL AND "cliente_creado" IS NOT NULL)
  );

-- La regla de seguridad del alta, en la base: solo se pudo haber entregado una
-- sesion sobre un registro confirmado que CREO la cuenta. Sobre una cuenta que
-- ya existia, la confirmacion presencial no alcanza y hay que verificar el
-- telefono por codigo (especificacion funcional, seccion 3).
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_sesion_solo_si_cuenta_nueva_chk"
  CHECK ("sesion_entregada_el" IS NULL OR ("estado" = 'confirmado' AND "cliente_creado"));
