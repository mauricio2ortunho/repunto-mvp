-- El sello puede ser el logo del negocio: un quinto valor de icono_sello.
-- Es una opcion por negocio, no obligatoria (decision del 2026-11-03). Sin
-- logo, las apps dibujan la estrella (selloQueSeDibuja, en contratos): la
-- base no exige logo_url para que el alta pueda elegir el logo y subirlo
-- en el paso siguiente.
--
-- La lista espejo vive en packages/contratos/src/diseno.ts
-- (ICONOS_DE_SELLO), y un test de integracion falla si divergen.
--
-- Para revertir: volver a crear el CHECK sin 'logo', despues de pasar los
-- negocios que lo usen a 'estrella'.

ALTER TABLE "negocio" DROP CONSTRAINT "negocio_icono_sello_chk";

ALTER TABLE "negocio" ADD CONSTRAINT "negocio_icono_sello_chk"
  CHECK ("icono_sello" IN ('cafe', 'estrella', 'corazon', 'huella', 'logo'));
