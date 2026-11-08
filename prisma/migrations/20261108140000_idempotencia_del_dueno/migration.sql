-- Idempotency-Key para lo que crea el panel del dueno (una version nueva de
-- la promo, una condicion nueva). peticion_idempotente se indexa por tablet
-- y peticion_idempotente_admin por admin; el dueno no tiene ninguno de los
-- dos. La misma mecanica, con el dueno: cada uno tiene su espacio de claves.
--
-- Para revertir: DROP TABLE "peticion_idempotente_dueno";

-- CreateTable
CREATE TABLE "peticion_idempotente_dueno" (
    "usuario_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "huella_peticion" TEXT NOT NULL,
    "respuesta" JSONB,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peticion_idempotente_dueno_pkey" PRIMARY KEY ("usuario_id","endpoint","clave")
);

-- CreateIndex
CREATE INDEX "peticion_idempotente_dueno_creado_el_idx" ON "peticion_idempotente_dueno"("creado_el");

-- AddForeignKey
ALTER TABLE "peticion_idempotente_dueno" ADD CONSTRAINT "peticion_idempotente_dueno_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario_negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar. Inventario y significado:
-- docs/garantias-de-la-base.md.
-- ===========================================================================

-- El mismo tope que peticion_idempotente_clave_razonable_chk.
ALTER TABLE "peticion_idempotente_dueno" ADD CONSTRAINT "peticion_idempotente_dueno_clave_razonable_chk"
  CHECK (char_length("clave") BETWEEN 8 AND 200);
