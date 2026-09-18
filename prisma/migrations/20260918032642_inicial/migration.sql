-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('dueno', 'supervisor', 'cajero');

-- CreateEnum
CREATE TYPE "estado_negocio" AS ENUM ('activo', 'suspendido');

-- CreateEnum
CREATE TYPE "estado_tarjeta" AS ENUM ('activa', 'canjeada', 'vencida');

-- CreateTable
CREATE TABLE "admin_plataforma" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telefono" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negocio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "canje_cualquier_local" BOOLEAN NOT NULL DEFAULT true,
    "logo_url" TEXT NOT NULL,
    "portada_url" TEXT NOT NULL,
    "color_principal" TEXT NOT NULL,
    "plantilla_tarjeta" TEXT NOT NULL,
    "icono_sello" TEXT NOT NULL,
    "estado" "estado_negocio" NOT NULL DEFAULT 'activo',
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "qr_slug" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_negocio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "rol" "rol_usuario" NOT NULL,
    "telefono" TEXT,
    "pin_hash" TEXT,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_local" (
    "usuario_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_local_pkey" PRIMARY KEY ("usuario_id","local_id")
);

-- CreateTable
CREATE TABLE "dispositivo_caja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "local_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "vinculado_el" TIMESTAMPTZ(3) NOT NULL,
    "revocado_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivo_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno_caja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dispositivo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "abierto_el" TIMESTAMPTZ(3) NOT NULL,
    "cerrado_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turno_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sellos_requeridos" INTEGER NOT NULL,
    "premio" TEXT NOT NULL,
    "vigencia_meses" INTEGER DEFAULT 1,
    "horas_entre_sellos" INTEGER NOT NULL,
    "pide_monto" BOOLEAN NOT NULL DEFAULT false,
    "vigente" BOOLEAN NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condicion_sello" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "monto_minimo" DECIMAL(12,2),
    "vigente_desde" TIMESTAMPTZ(3) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condicion_sello_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telefono" TEXT NOT NULL,
    "email" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono_verificado" BOOLEAN NOT NULL DEFAULT false,
    "semilla_totp" TEXT NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivo_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ultimo_acceso" TIMESTAMPTZ(3) NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivo_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarjeta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "programa_id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "local_alta_id" UUID NOT NULL,
    "estado" "estado_tarjeta" NOT NULL DEFAULT 'activa',
    "reloj_desde" TIMESTAMPTZ(3),
    "vence_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarjeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sello" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tarjeta_id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "condicion_id" UUID NOT NULL,
    "monto" DECIMAL(12,2),
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anulado_el" TIMESTAMPTZ(3),
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sello_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canje" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tarjeta_id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "turno_id" UUID NOT NULL,
    "premio_texto" TEXT NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_usado" (
    "cliente_id" UUID NOT NULL,
    "ventana" INTEGER NOT NULL,
    "negocio_id" UUID NOT NULL,
    "creado_el" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_usado_pkey" PRIMARY KEY ("cliente_id","ventana")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_plataforma_telefono_key" ON "admin_plataforma"("telefono");

-- CreateIndex
CREATE INDEX "negocio_estado_idx" ON "negocio"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "local_qr_slug_key" ON "local"("qr_slug");

-- CreateIndex
CREATE INDEX "local_negocio_id_activo_idx" ON "local"("negocio_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "local_id_negocio_id_key" ON "local"("id", "negocio_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_negocio_telefono_key" ON "usuario_negocio"("telefono");

-- CreateIndex
CREATE INDEX "usuario_negocio_negocio_id_rol_activo_idx" ON "usuario_negocio"("negocio_id", "rol", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_negocio_id_negocio_id_key" ON "usuario_negocio"("id", "negocio_id");

-- CreateIndex
CREATE INDEX "usuario_local_local_id_activo_idx" ON "usuario_local"("local_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_caja_token_hash_key" ON "dispositivo_caja"("token_hash");

-- CreateIndex
CREATE INDEX "dispositivo_caja_local_id_revocado_el_idx" ON "dispositivo_caja"("local_id", "revocado_el");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_caja_id_local_id_key" ON "dispositivo_caja"("id", "local_id");

-- CreateIndex
CREATE INDEX "turno_caja_dispositivo_id_abierto_el_idx" ON "turno_caja"("dispositivo_id", "abierto_el");

-- CreateIndex
CREATE INDEX "turno_caja_usuario_id_abierto_el_idx" ON "turno_caja"("usuario_id", "abierto_el");

-- CreateIndex
CREATE UNIQUE INDEX "turno_caja_id_local_id_key" ON "turno_caja"("id", "local_id");

-- CreateIndex
CREATE UNIQUE INDEX "programa_id_negocio_id_key" ON "programa"("id", "negocio_id");

-- CreateIndex
CREATE UNIQUE INDEX "programa_negocio_id_version_key" ON "programa"("negocio_id", "version");

-- CreateIndex
CREATE INDEX "condicion_sello_negocio_id_vigente_desde_idx" ON "condicion_sello"("negocio_id", "vigente_desde" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "condicion_sello_id_negocio_id_key" ON "condicion_sello"("id", "negocio_id");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_telefono_key" ON "cliente"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_cliente_token_hash_key" ON "dispositivo_cliente"("token_hash");

-- CreateIndex
CREATE INDEX "dispositivo_cliente_cliente_id_ultimo_acceso_idx" ON "dispositivo_cliente"("cliente_id", "ultimo_acceso");

-- CreateIndex
CREATE INDEX "tarjeta_cliente_id_estado_idx" ON "tarjeta"("cliente_id", "estado");

-- CreateIndex
CREATE INDEX "tarjeta_estado_vence_el_idx" ON "tarjeta"("estado", "vence_el");

-- CreateIndex
CREATE INDEX "tarjeta_negocio_id_creado_el_idx" ON "tarjeta"("negocio_id", "creado_el");

-- CreateIndex
CREATE INDEX "tarjeta_programa_id_idx" ON "tarjeta"("programa_id");

-- CreateIndex
CREATE UNIQUE INDEX "tarjeta_id_negocio_id_key" ON "tarjeta"("id", "negocio_id");

-- CreateIndex
CREATE INDEX "sello_tarjeta_id_creado_el_idx" ON "sello"("tarjeta_id", "creado_el");

-- CreateIndex
CREATE INDEX "sello_local_id_creado_el_idx" ON "sello"("local_id", "creado_el");

-- CreateIndex
CREATE INDEX "sello_negocio_id_creado_el_idx" ON "sello"("negocio_id", "creado_el");

-- CreateIndex
CREATE INDEX "sello_turno_id_idx" ON "sello"("turno_id");

-- CreateIndex
CREATE INDEX "sello_condicion_id_idx" ON "sello"("condicion_id");

-- CreateIndex
CREATE UNIQUE INDEX "canje_tarjeta_id_key" ON "canje"("tarjeta_id");

-- CreateIndex
CREATE INDEX "canje_local_id_creado_el_idx" ON "canje"("local_id", "creado_el");

-- CreateIndex
CREATE INDEX "canje_negocio_id_creado_el_idx" ON "canje"("negocio_id", "creado_el");

-- CreateIndex
CREATE UNIQUE INDEX "canje_tarjeta_id_negocio_id_key" ON "canje"("tarjeta_id", "negocio_id");

-- CreateIndex
CREATE INDEX "codigo_usado_creado_el_idx" ON "codigo_usado"("creado_el");

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "usuario_negocio" ADD CONSTRAINT "usuario_negocio_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "usuario_local" ADD CONSTRAINT "usuario_local_usuario_mismo_negocio_fkey" FOREIGN KEY ("usuario_id", "negocio_id") REFERENCES "usuario_negocio"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "usuario_local" ADD CONSTRAINT "usuario_local_local_mismo_negocio_fkey" FOREIGN KEY ("local_id", "negocio_id") REFERENCES "local"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dispositivo_caja" ADD CONSTRAINT "dispositivo_caja_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "local"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_dispositivo_mismo_local_fkey" FOREIGN KEY ("dispositivo_id", "local_id") REFERENCES "dispositivo_caja"("id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_usuario_asignado_al_local_fkey" FOREIGN KEY ("usuario_id", "local_id") REFERENCES "usuario_local"("usuario_id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "programa" ADD CONSTRAINT "programa_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "condicion_sello" ADD CONSTRAINT "condicion_sello_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "condicion_sello" ADD CONSTRAINT "condicion_sello_autor_mismo_negocio_fkey" FOREIGN KEY ("usuario_id", "negocio_id") REFERENCES "usuario_negocio"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "dispositivo_cliente" ADD CONSTRAINT "dispositivo_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarjeta" ADD CONSTRAINT "tarjeta_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarjeta" ADD CONSTRAINT "tarjeta_programa_mismo_negocio_fkey" FOREIGN KEY ("programa_id", "negocio_id") REFERENCES "programa"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarjeta" ADD CONSTRAINT "tarjeta_local_alta_mismo_negocio_fkey" FOREIGN KEY ("local_alta_id", "negocio_id") REFERENCES "local"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sello" ADD CONSTRAINT "sello_tarjeta_mismo_negocio_fkey" FOREIGN KEY ("tarjeta_id", "negocio_id") REFERENCES "tarjeta"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sello" ADD CONSTRAINT "sello_local_mismo_negocio_fkey" FOREIGN KEY ("local_id", "negocio_id") REFERENCES "local"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sello" ADD CONSTRAINT "sello_turno_mismo_local_fkey" FOREIGN KEY ("turno_id", "local_id") REFERENCES "turno_caja"("id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sello" ADD CONSTRAINT "sello_condicion_mismo_negocio_fkey" FOREIGN KEY ("condicion_id", "negocio_id") REFERENCES "condicion_sello"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "canje" ADD CONSTRAINT "canje_tarjeta_mismo_negocio_fkey" FOREIGN KEY ("tarjeta_id", "negocio_id") REFERENCES "tarjeta"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "canje" ADD CONSTRAINT "canje_local_mismo_negocio_fkey" FOREIGN KEY ("local_id", "negocio_id") REFERENCES "local"("id", "negocio_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "canje" ADD CONSTRAINT "canje_turno_mismo_local_fkey" FOREIGN KEY ("turno_id", "local_id") REFERENCES "turno_caja"("id", "local_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "codigo_usado" ADD CONSTRAINT "codigo_usado_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "codigo_usado" ADD CONSTRAINT "codigo_usado_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "negocio"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ===========================================================================
-- Restricciones que Prisma no sabe expresar en schema.prisma.
-- Inventario espejo al final de prisma/schema.prisma. Si una migracion
-- futura intenta dropear alguna de estas, esta mal generada.
-- ===========================================================================

-- INV-11: como maximo una tarjeta activa por (cliente, negocio).
-- tarjeta.negocio_id no puede diferir del negocio de su programa: lo ata la FK
-- compuesta tarjeta_programa_mismo_negocio_fkey. Por eso este indice es fiel.
CREATE UNIQUE INDEX "tarjeta_una_activa_por_cliente_negocio"
  ON "tarjeta" ("cliente_id", "negocio_id")
  WHERE "estado" = 'activa';

-- INV-5: solo una version vigente del programa por negocio.
CREATE UNIQUE INDEX "programa_una_vigente_por_negocio"
  ON "programa" ("negocio_id")
  WHERE "vigente";

-- INV-5: las versiones se numeran desde 1.
ALTER TABLE "programa" ADD CONSTRAINT "programa_version_positiva_chk"
  CHECK ("version" > 0);

-- INV-12: una tarjeta sin sellos no vence. Si hay vencimiento, hay reloj, y
-- el vencimiento es posterior al arranque del reloj.
ALTER TABLE "tarjeta" ADD CONSTRAINT "tarjeta_vence_solo_con_reloj_chk"
  CHECK ("vence_el" IS NULL OR ("reloj_desde" IS NOT NULL AND "vence_el" > "reloj_desde"));

-- INV-17: anular marca, no borra. La bandera y la fecha van juntas.
ALTER TABLE "sello" ADD CONSTRAINT "sello_anulado_con_fecha_chk"
  CHECK (("anulado" AND "anulado_el" IS NOT NULL) OR (NOT "anulado" AND "anulado_el" IS NULL));

-- INV-20: telefono en E.164. La normalizacion ocurre en el borde de la API;
-- esto es la red por si alguien se la saltea.
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_telefono_e164_chk"
  CHECK ("telefono" ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE "admin_plataforma" ADD CONSTRAINT "admin_plataforma_telefono_e164_chk"
  CHECK ("telefono" ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE "usuario_negocio" ADD CONSTRAINT "usuario_negocio_telefono_e164_chk"
  CHECK ("telefono" IS NULL OR "telefono" ~ '^\+[1-9][0-9]{7,14}$');

-- El dueno entra por telefono; supervisor y cajero entran por PIN.
ALTER TABLE "usuario_negocio" ADD CONSTRAINT "usuario_negocio_dueno_con_telefono_chk"
  CHECK ("rol" <> 'dueno' OR "telefono" IS NOT NULL);

-- Personalizacion. Plantilla e icono son PROVISIONALES: los valores salen del
-- trabajo de diseno. Cambiarlos es DROP + ADD de este CHECK, una linea.
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_color_principal_hex_chk"
  CHECK ("color_principal" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_plantilla_tarjeta_chk"
  CHECK ("plantilla_tarjeta" IN ('clasica', 'moderna', 'minima'));
ALTER TABLE "negocio" ADD CONSTRAINT "negocio_icono_sello_chk"
  CHECK ("icono_sello" IN ('cafe', 'estrella', 'corazon', 'huella'));

-- Cordura del programa.
ALTER TABLE "programa" ADD CONSTRAINT "programa_sellos_requeridos_positivo_chk"
  CHECK ("sellos_requeridos" > 0);
ALTER TABLE "programa" ADD CONSTRAINT "programa_horas_entre_sellos_no_negativo_chk"
  CHECK ("horas_entre_sellos" >= 0);
ALTER TABLE "programa" ADD CONSTRAINT "programa_vigencia_meses_positiva_chk"
  CHECK ("vigencia_meses" IS NULL OR "vigencia_meses" > 0);

-- Montos nunca negativos.
ALTER TABLE "sello" ADD CONSTRAINT "sello_monto_no_negativo_chk"
  CHECK ("monto" IS NULL OR "monto" >= 0);
ALTER TABLE "condicion_sello" ADD CONSTRAINT "condicion_sello_monto_minimo_no_negativo_chk"
  CHECK ("monto_minimo" IS NULL OR "monto_minimo" >= 0);

-- Orden temporal.
ALTER TABLE "turno_caja" ADD CONSTRAINT "turno_caja_cierre_posterior_chk"
  CHECK ("cerrado_el" IS NULL OR "cerrado_el" >= "abierto_el");
ALTER TABLE "dispositivo_caja" ADD CONSTRAINT "dispositivo_caja_revocado_posterior_chk"
  CHECK ("revocado_el" IS NULL OR "revocado_el" >= "vinculado_el");

-- Ventana del codigo rotativo: floor(epoch_segundos / 30).
ALTER TABLE "codigo_usado" ADD CONSTRAINT "codigo_usado_ventana_no_negativa_chk"
  CHECK ("ventana" >= 0);
