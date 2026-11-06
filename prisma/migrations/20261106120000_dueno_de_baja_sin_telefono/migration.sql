-- Un dueno dado de baja libera su telefono.
--
-- El telefono es unico en toda la plataforma (usuario_negocio_telefono_key):
-- mientras un dueno de baja lo conservara, esa persona no podia cargarse en
-- otro negocio. Ahora el telefono se le exige solo al dueno activo, que es
-- el que entra con el; al darlo de baja, la api lo borra, y al reactivarlo
-- pide uno.
--
-- Para revertir: volver a la definicion anterior,
--   CHECK ("rol" <> 'dueno' OR "telefono" IS NOT NULL)
-- que falla si ya hay duenos de baja sin telefono, y eso es lo correcto.

ALTER TABLE "usuario_negocio" DROP CONSTRAINT "usuario_negocio_dueno_con_telefono_chk";

ALTER TABLE "usuario_negocio" ADD CONSTRAINT "usuario_negocio_dueno_con_telefono_chk"
  CHECK ("rol" <> 'dueno' OR NOT "activo" OR "telefono" IS NOT NULL);
