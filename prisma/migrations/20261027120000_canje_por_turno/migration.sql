-- La ultima actividad de un turno (cierre por inactividad, CLAUDE.md seccion 6)
-- mira sus canjes en cada pedido de la caja. Los sellos ya tenian su indice.
CREATE INDEX "canje_turno_id_idx" ON "canje"("turno_id");
