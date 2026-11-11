-- Numero de emparejamiento en el alta del mostrador (decision del usuario del
-- 2026-11-11). El telefono del cliente y la lista del cajero muestran los
-- mismos dos digitos, y el cajero pregunta "que numero te sale?" antes de
-- confirmar. Cierra el ataque de CLAUDE.md seccion 15: quien se registra
-- antes con el telefono de otro tiene una fila con SU numero, y la persona
-- que esta en el mostrador no lo tiene.
--
-- El numero lo pone la api, derivado del ticket (el reintento ve el mismo).
-- El valor por defecto al azar es para las filas que ya existen y para la
-- api desplegada antes de esta version, que todavia no lo manda.
--
-- Para revertir: ALTER TABLE "registro_pendiente" DROP COLUMN "numero";

-- AlterTable
ALTER TABLE "registro_pendiente" ADD COLUMN     "numero" SMALLINT NOT NULL DEFAULT ((10)::double precision + floor((random() * (90)::double precision)));


-- Dos digitos: lo que se dice en voz alta sin confundirse.
ALTER TABLE "registro_pendiente" ADD CONSTRAINT "registro_pendiente_numero_chk"
  CHECK ("numero" BETWEEN 10 AND 99);
