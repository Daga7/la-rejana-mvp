CREATE TABLE "cuentas_mesa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"mesa_id" uuid NOT NULL,
	"mesero_id" uuid,
	"comensales" integer NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"cuenta_pedida_en" timestamp with time zone,
	"propina" integer DEFAULT 0 NOT NULL,
	"estado_pago" text DEFAULT 'pendiente' NOT NULL,
	"abierta_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrada_en" timestamp with time zone,
	"cerrada_por" uuid,
	CONSTRAINT "cuentas_mesa_estado_ck" CHECK ("cuentas_mesa"."estado" in ('abierta','cerrada','cancelada')),
	CONSTRAINT "cuentas_mesa_comensales_ck" CHECK ("cuentas_mesa"."comensales" between 1 and 30),
	CONSTRAINT "cuentas_mesa_propina_ck" CHECK ("cuentas_mesa"."propina" >= 0),
	CONSTRAINT "cuentas_mesa_cierre_ck" CHECK (("cuentas_mesa"."estado" = 'abierta') = ("cuentas_mesa"."cerrada_en" is null))
);
--> statement-breakpoint
CREATE TABLE "mesas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"zona" text,
	"puestos" integer DEFAULT 4 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mesas_numero_ck" CHECK ("mesas"."numero" between 1 and 999),
	CONSTRAINT "mesas_puestos_ck" CHECK ("mesas"."puestos" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "pagos" ALTER COLUMN "pedido_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "contacto_nombre" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "contacto_telefono" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "direccion" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ALTER COLUMN "metodo_pago" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pagos" ADD COLUMN "cuenta_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "cuenta_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "ronda" integer;--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_mesa_id_mesas_id_fk" FOREIGN KEY ("mesa_id") REFERENCES "public"."mesas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_mesero_id_usuarios_id_fk" FOREIGN KEY ("mesero_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_cerrada_por_usuarios_id_fk" FOREIGN KEY ("cerrada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_mesa_abierta_uq" ON "cuentas_mesa" USING btree ("mesa_id") WHERE "cuentas_mesa"."estado" = 'abierta';--> statement-breakpoint
CREATE INDEX "cuentas_mesa_sede_estado_idx" ON "cuentas_mesa" USING btree ("sede_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "mesas_sede_numero_uq" ON "mesas" USING btree ("sede_id","numero");--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_id_cuentas_mesa_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_mesa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cuenta_id_cuentas_mesa_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_mesa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pagos_cuenta_idx" ON "pagos" USING btree ("cuenta_id");--> statement-breakpoint
CREATE INDEX "pedidos_cuenta_idx" ON "pedidos" USING btree ("cuenta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_cuenta_ronda_uq" ON "pedidos" USING btree ("cuenta_id","ronda");--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_destino_ck" CHECK (("pagos"."pedido_id" is null) <> ("pagos"."cuenta_id" is null));--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_canal_ck" CHECK (("pedidos"."canal" = 'domicilio' and "pedidos"."cuenta_id" is null and "pedidos"."ronda" is null and "pedidos"."contacto_nombre" is not null and "pedidos"."contacto_telefono" is not null and "pedidos"."direccion" is not null and "pedidos"."lat" is not null and "pedidos"."lng" is not null and "pedidos"."metodo_pago" is not null)
        or ("pedidos"."canal" = 'mesa' and "pedidos"."cuenta_id" is not null and "pedidos"."ronda" >= 1 and "pedidos"."costo_envio" = 0 and "pedidos"."cliente_id" is null and "pedidos"."domiciliario_id" is null and "pedidos"."estado" <> 'en_camino'));