-- El rubro del negocio deja de ser texto libre: es la lista fija que agrupa
-- el directorio de la app y que el alta ofrece en un desplegable. La lista
-- espejo vive en packages/contratos/src/diseno.ts (RUBROS_DE_NEGOCIO), y un
-- test de integracion falla si las dos divergen.
--
-- Hasta hoy todos los negocios son 'cafe', que esta en la lista: el CHECK se
-- valida sobre las filas existentes sin tocarlas.
--
-- Para revertir: ALTER TABLE "negocio" DROP CONSTRAINT "negocio_categoria_chk";

ALTER TABLE "negocio" ADD CONSTRAINT "negocio_categoria_chk"
  CHECK ("categoria" IN (
    'cafe', 'panaderia', 'heladeria', 'restaurante', 'comida_rapida',
    'peluqueria', 'barberia', 'estetica', 'lavanderia', 'mascotas', 'otro'
  ));
