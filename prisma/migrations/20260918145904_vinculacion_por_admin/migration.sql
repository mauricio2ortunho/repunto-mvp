-- AlterTable
ALTER TABLE "vinculacion_pendiente" ADD COLUMN     "creado_por_admin_id" UUID,
ALTER COLUMN "creado_por_usuario_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_creado_por_admin_id_fkey" FOREIGN KEY ("creado_por_admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restriccion que Prisma no sabe expresar. Inventario y significado:
-- docs/garantias-de-la-base.md.
-- ===========================================================================

-- Dos origenes excluyentes para el codigo de vinculacion: alguien asignado al
-- local, o el admin de plataforma vinculando la tablet en la capacitacion del
-- primer dia. Exactamente uno: nunca los dos, nunca ninguno. Asi queda
-- auditado quien vinculo cada tablet sin aflojar la FK a usuario_local.
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_un_solo_origen_chk"
  CHECK (("creado_por_usuario_id" IS NULL) <> ("creado_por_admin_id" IS NULL));
