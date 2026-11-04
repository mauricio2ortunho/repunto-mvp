-- Alta de negocios desde el panel de administracion.
--
-- 1. La condicion del sello del alta la escribe el admin, cuando todavia no
--    hay nadie del negocio que la firme: condicion_sello gana un segundo
--    autor posible, creado_por_admin_id, con el mismo patron que
--    vinculacion_pendiente. Exactamente uno de los dos.
-- 2. Idempotency-Key para lo que crea el admin: peticion_idempotente se
--    indexa por tablet, y el admin no tiene una.
--
-- Para revertir: DROP TABLE "peticion_idempotente_admin"; y en
-- condicion_sello, DROP CONSTRAINT "condicion_sello_un_solo_autor_chk",
-- DROP COLUMN "creado_por_admin_id" y SET NOT NULL en "usuario_id" (falla
-- si ya hay condiciones escritas por un admin, que es lo correcto).

-- AlterTable
ALTER TABLE "condicion_sello" ADD COLUMN     "creado_por_admin_id" UUID,
ALTER COLUMN "usuario_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "peticion_idempotente_admin" (
    "admin_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "huella_peticion" TEXT NOT NULL,
    "respuesta" JSONB,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peticion_idempotente_admin_pkey" PRIMARY KEY ("admin_id","endpoint","clave")
);

-- CreateIndex
CREATE INDEX "peticion_idempotente_admin_creado_el_idx" ON "peticion_idempotente_admin"("creado_el");

-- AddForeignKey
ALTER TABLE "condicion_sello" ADD CONSTRAINT "condicion_sello_creado_por_admin_id_fkey" FOREIGN KEY ("creado_por_admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "peticion_idempotente_admin" ADD CONSTRAINT "peticion_idempotente_admin_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_plataforma"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar. Inventario y significado:
-- docs/garantias-de-la-base.md.
-- ===========================================================================

-- Toda condicion sabe quien la escribio: alguien del negocio o un admin,
-- nunca los dos ni ninguno. Sin esto, una condicion con usuario_id nulo
-- dejaria sin respuesta "quien cambio la condicion" (especificacion, 4).
ALTER TABLE "condicion_sello" ADD CONSTRAINT "condicion_sello_un_solo_autor_chk"
  CHECK (("usuario_id" IS NULL) <> ("creado_por_admin_id" IS NULL));

-- El mismo tope que peticion_idempotente_clave_razonable_chk.
ALTER TABLE "peticion_idempotente_admin" ADD CONSTRAINT "peticion_idempotente_admin_clave_razonable_chk"
  CHECK (char_length("clave") BETWEEN 8 AND 200);
