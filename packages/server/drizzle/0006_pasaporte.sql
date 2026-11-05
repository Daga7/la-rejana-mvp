CREATE TABLE "canjes_pasaporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid,
	"sede_id" uuid NOT NULL,
	"cuenta_id" uuid,
	"pedido_id" uuid,
	"sellos_usados" integer NOT NULL,
	"premio_nombre" text NOT NULL,
	"canjeado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pasaporte_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"activo" boolean DEFAULT false NOT NULL,
	"sellos_para_premio" integer DEFAULT 8 NOT NULL,
	"monto_minimo" integer DEFAULT 0 NOT NULL,
	"premio_producto_id" uuid,
	"premio_descripcion" text,
	"vigencia_meses" integer DEFAULT 6 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" uuid,
	CONSTRAINT "pasaporte_config_unica_ck" CHECK ("pasaporte_config"."id" = 1),
	CONSTRAINT "pasaporte_config_valores_ck" CHECK ("pasaporte_config"."sellos_para_premio" between 2 and 20 and "pasaporte_config"."monto_minimo" >= 0 and "pasaporte_config"."vigencia_meses" between 0 and 36)
);
--> statement-breakpoint
CREATE TABLE "pasaportes" (
	"cliente_id" uuid PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"aceptado_en" timestamp with time zone NOT NULL,
	"version_terminos" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"pedido_id" uuid,
	"cuenta_id" uuid,
	"monto" integer NOT NULL,
	"otorgado_por" uuid,
	"canje_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellos_compra_ck" CHECK (("sellos"."pedido_id" is null) <> ("sellos"."cuenta_id" is null))
);
--> statement-breakpoint
ALTER TABLE "canjes_pasaporte" ADD CONSTRAINT "canjes_pasaporte_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes_pasaporte" ADD CONSTRAINT "canjes_pasaporte_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes_pasaporte" ADD CONSTRAINT "canjes_pasaporte_cuenta_id_cuentas_mesa_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_mesa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes_pasaporte" ADD CONSTRAINT "canjes_pasaporte_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canjes_pasaporte" ADD CONSTRAINT "canjes_pasaporte_canjeado_por_usuarios_id_fk" FOREIGN KEY ("canjeado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasaporte_config" ADD CONSTRAINT "pasaporte_config_premio_producto_id_productos_id_fk" FOREIGN KEY ("premio_producto_id") REFERENCES "public"."productos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasaporte_config" ADD CONSTRAINT "pasaporte_config_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasaportes" ADD CONSTRAINT "pasaportes_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellos" ADD CONSTRAINT "sellos_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellos" ADD CONSTRAINT "sellos_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellos" ADD CONSTRAINT "sellos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellos" ADD CONSTRAINT "sellos_cuenta_id_cuentas_mesa_id_fk" FOREIGN KEY ("cuenta_id") REFERENCES "public"."cuentas_mesa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellos" ADD CONSTRAINT "sellos_otorgado_por_usuarios_id_fk" FOREIGN KEY ("otorgado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sellos" ADD CONSTRAINT "sellos_canje_id_canjes_pasaporte_id_fk" FOREIGN KEY ("canje_id") REFERENCES "public"."canjes_pasaporte"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canjes_pasaporte_cliente_idx" ON "canjes_pasaporte" USING btree ("cliente_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "pasaportes_codigo_uq" ON "pasaportes" USING btree ("codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "sellos_pedido_uq" ON "sellos" USING btree ("pedido_id") WHERE "sellos"."pedido_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sellos_cuenta_uq" ON "sellos" USING btree ("cuenta_id") WHERE "sellos"."cuenta_id" is not null;--> statement-breakpoint
CREATE INDEX "sellos_cliente_idx" ON "sellos" USING btree ("cliente_id","creado_en");--> statement-breakpoint
-- Configuración inicial del programa: apagado hasta que el admin elija el premio.
INSERT INTO "pasaporte_config" ("id", "activo", "sellos_para_premio", "monto_minimo", "vigencia_meses") VALUES (1, false, 8, 20000, 6) ON CONFLICT ("id") DO NOTHING;
