-- AlterTable
ALTER TABLE "dispositivo_caja" ADD COLUMN     "vinculacion_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_caja_vinculacion_id_key" ON "dispositivo_caja"("vinculacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_caja_vinculacion_id_local_id_key" ON "dispositivo_caja"("vinculacion_id", "local_id");

-- CreateIndex
CREATE UNIQUE INDEX "vinculacion_pendiente_id_local_id_key" ON "vinculacion_pendiente"("id", "local_id");

-- AddForeignKey
ALTER TABLE "dispositivo_caja" ADD CONSTRAINT "dispositivo_caja_vinculacion_mismo_local_fkey" FOREIGN KEY ("vinculacion_id", "local_id") REFERENCES "vinculacion_pendiente"("id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

