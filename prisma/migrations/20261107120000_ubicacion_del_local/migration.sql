-- Donde esta cada local en el mapa: la marca el admin y el cliente la usa
-- para llegar. Opcional; seis decimales son unos diez centimetros.
ALTER TABLE "local" ADD COLUMN "latitud" DECIMAL(9,6),
ADD COLUMN "longitud" DECIMAL(9,6);

-- Las dos o ninguna, y dentro del planeta. Sin el IS NOT NULL explicito, una
-- sola coordenada pasaria: un CHECK que da NULL acepta la fila.
ALTER TABLE "local" ADD CONSTRAINT "local_ubicacion_valida_chk" CHECK (
  ("latitud" IS NULL AND "longitud" IS NULL)
  OR ("latitud" IS NOT NULL AND "longitud" IS NOT NULL
      AND "latitud" BETWEEN -90 AND 90 AND "longitud" BETWEEN -180 AND 180)
);
