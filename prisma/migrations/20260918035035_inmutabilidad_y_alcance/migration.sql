-- DropForeignKey
ALTER TABLE "sello" DROP CONSTRAINT "sello_anulado_turno_id_fkey";

-- DropForeignKey
ALTER TABLE "vinculacion_pendiente" DROP CONSTRAINT "vinculacion_pendiente_creado_por_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "vinculacion_pendiente" DROP CONSTRAINT "vinculacion_pendiente_local_id_fkey";

-- AddForeignKey
ALTER TABLE "vinculacion_pendiente" ADD CONSTRAINT "vinculacion_pendiente_creador_asignado_al_local_fkey" FOREIGN KEY ("creado_por_usuario_id", "local_id") REFERENCES "usuario_local"("usuario_id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sello" ADD CONSTRAINT "sello_anulado_turno_mismo_local_fkey" FOREIGN KEY ("anulado_turno_id", "local_id") REFERENCES "turno_caja"("id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Triggers de inmutabilidad. Prisma no los expresa ni los ve.
-- Inventario y significado: docs/garantias-de-la-base.md.
--
-- Cada uno rechaza con ERRCODE 23000 (integrity_constraint_violation) y se
-- reporta con CONSTRAINT = su propio nombre, igual que una restriccion comun:
-- quien lo atrape lo reconoce por error.constraint, no por el texto.
-- ===========================================================================

-- INV-6: una tarjeta nunca cambia de programa_id. Cambiarle el programa a una
-- tarjeta en curso le cambia las reglas a alguien que ya empezo a juntar.
CREATE FUNCTION "tarjeta_programa_id_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."programa_id" IS DISTINCT FROM OLD."programa_id" THEN
    RAISE EXCEPTION 'Una tarjeta no cambia de programa: termina con la regla con la que empezo (INV-6).'
      USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'tarjeta_programa_id_inmutable',
            TABLE = 'tarjeta';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tarjeta_programa_id_inmutable"
  BEFORE UPDATE OF "programa_id" ON "tarjeta"
  FOR EACH ROW EXECUTE FUNCTION "tarjeta_programa_id_inmutable"();

-- INV-5: un programa nunca se edita. Lo unico permitido es dejar de ser
-- vigente (true -> false) al crear la version siguiente. Tampoco se borra:
-- borrar y reinsertar con el mismo numero de version seria editarlo.
-- La comparacion es sobre la fila entera menos "vigente", asi que una columna
-- que se agregue en el futuro queda protegida sin tocar este trigger.
CREATE FUNCTION "programa_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un programa no se borra: cada version es la regla con la que alguien junto sellos (INV-5, INV-17).'
      USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'programa_inmutable',
            TABLE = 'programa';
  END IF;
  IF (to_jsonb(NEW) - 'vigente') IS DISTINCT FROM (to_jsonb(OLD) - 'vigente')
     OR (NEW."vigente" AND NOT OLD."vigente") THEN
    RAISE EXCEPTION 'Un programa no se edita: cambiar la regla crea una version nueva. Solo puede dejar de ser vigente (INV-5).'
      USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'programa_inmutable',
            TABLE = 'programa';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "programa_inmutable"
  BEFORE UPDATE OR DELETE ON "programa"
  FOR EACH ROW EXECUTE FUNCTION "programa_inmutable"();

-- INV-7: condicion_sello es de solo insercion. Cambiar la condicion es
-- insertar una nueva; editar o borrar una vieja borraria la respuesta a
-- "ayer decia que valia el capuchino", que es el motivo de esta tabla.
CREATE FUNCTION "condicion_sello_solo_insercion"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Una condicion no se edita ni se borra: cambiarla es insertar una nueva (INV-7).'
    USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'condicion_sello_solo_insercion',
          TABLE = 'condicion_sello';
END;
$$;

CREATE TRIGGER "condicion_sello_solo_insercion"
  BEFORE UPDATE OR DELETE ON "condicion_sello"
  FOR EACH ROW EXECUTE FUNCTION "condicion_sello_solo_insercion"();
