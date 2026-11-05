CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_rol" text,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" text,
	"datos" jsonb,
	"ip" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buzon_mensajes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"mensaje" text NOT NULL,
	"anonimo" boolean NOT NULL,
	"autor_id" uuid,
	"sede_id" uuid,
	"estado" text DEFAULT 'nueva' NOT NULL,
	"fecha" date NOT NULL,
	"actualizado_en" timestamp with time zone,
	CONSTRAINT "buzon_anonimo_sin_autor_ck" CHECK (not "buzon_mensajes"."anonimo" or ("buzon_mensajes"."autor_id" is null and "buzon_mensajes"."sede_id" is null))
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codigos_verificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"proposito" text NOT NULL,
	"codigo_hash" text NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"consumido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "direcciones_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"etiqueta" text DEFAULT 'Casa' NOT NULL,
	"direccion" text NOT NULL,
	"detalle" text,
	"barrio" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identidades_oauth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"proveedor" text NOT NULL,
	"sujeto" text NOT NULL,
	"email" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"unidad" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insumos_unidad_ck" CHECK ("insumos"."unidad" in ('g','ml','und'))
);
--> statement-breakpoint
CREATE TABLE "inventario" (
	"sede_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"cantidad" numeric(14, 3) DEFAULT 0 NOT NULL,
	"stock_minimo" numeric(14, 3) DEFAULT 0 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventario_sede_id_insumo_id_pk" PRIMARY KEY("sede_id","insumo_id"),
	CONSTRAINT "inventario_no_negativo_ck" CHECK ("inventario"."cantidad" >= 0),
	CONSTRAINT "inventario_minimo_ck" CHECK ("inventario"."stock_minimo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invitaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"rol" text NOT NULL,
	"sede_id" uuid,
	"token_hash" text NOT NULL,
	"invitado_por" uuid,
	"expira_en" timestamp with time zone NOT NULL,
	"aceptada_en" timestamp with time zone,
	"revocada_en" timestamp with time zone,
	"usuario_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_sede" (
	"sede_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio" integer NOT NULL,
	"disponible" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_sede_sede_id_producto_id_pk" PRIMARY KEY("sede_id","producto_id"),
	CONSTRAINT "menu_precio_ck" CHECK ("menu_sede"."precio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "movimientos_inventario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	"saldo_resultante" numeric(14, 3) NOT NULL,
	"pedido_id" uuid,
	"usuario_id" uuid,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"metodo" text NOT NULL,
	"monto" integer NOT NULL,
	"recibido" integer,
	"cambio" integer,
	"referencia" text,
	"registrado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_monto_ck" CHECK ("pagos"."monto" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pedido_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"estado" text NOT NULL,
	"actor_id" uuid,
	"actor_rol" text,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"precio_unitario" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"notas" text,
	"subtotal" integer NOT NULL,
	CONSTRAINT "pedido_items_cantidad_ck" CHECK ("pedido_items"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "pedido_suscripciones" (
	"pedido_id" uuid NOT NULL,
	"suscripcion_id" uuid NOT NULL,
	CONSTRAINT "pedido_suscripciones_pedido_id_suscripcion_id_pk" PRIMARY KEY("pedido_id","suscripcion_id")
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "pedidos_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"sede_id" uuid NOT NULL,
	"canal" text DEFAULT 'domicilio' NOT NULL,
	"cliente_id" uuid,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"contacto_nombre" text NOT NULL,
	"contacto_telefono" text NOT NULL,
	"direccion" text NOT NULL,
	"direccion_detalle" text,
	"barrio" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"notas" text,
	"metodo_pago" text NOT NULL,
	"paga_con" integer,
	"subtotal" integer NOT NULL,
	"costo_envio" integer NOT NULL,
	"total" integer NOT NULL,
	"estado_pago" text DEFAULT 'pendiente' NOT NULL,
	"domiciliario_id" uuid,
	"recorrido_id" uuid,
	"token_seguimiento_hash" text,
	"clave_idempotencia" text,
	"motivo_cancelacion" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"en_camino_en" timestamp with time zone,
	"entregado_en" timestamp with time zone,
	"cancelado_en" timestamp with time zone,
	"cerrado_en" timestamp with time zone,
	"cerrado_por" uuid,
	CONSTRAINT "pedidos_estado_ck" CHECK ("pedidos"."estado" in ('recibido','en_preparacion','listo','en_camino','entregado','cancelado')),
	CONSTRAINT "pedidos_totales_ck" CHECK ("pedidos"."subtotal" >= 0 and "pedidos"."costo_envio" >= 0 and "pedidos"."total" = "pedidos"."subtotal" + "pedidos"."costo_envio")
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"slug" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"imagen_url" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receta_items" (
	"producto_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"cantidad" numeric(14, 3) NOT NULL,
	CONSTRAINT "receta_items_producto_id_insumo_id_pk" PRIMARY KEY("producto_id","insumo_id"),
	CONSTRAINT "receta_cantidad_ck" CHECK ("receta_items"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "recorridos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sede_id" uuid NOT NULL,
	"domiciliario_id" uuid NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"orden_paradas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ultima_lat" double precision,
	"ultima_lng" double precision,
	"ultima_ubicacion_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sedes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text NOT NULL,
	"barrio" text DEFAULT '' NOT NULL,
	"telefono" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"hora_apertura" time NOT NULL,
	"hora_cierre" time NOT NULL,
	"tarifa_domicilio" integer DEFAULT 0 NOT NULL,
	"limite_minutos_entrega" integer DEFAULT 25 NOT NULL,
	"minutos_preparacion" integer DEFAULT 20 NOT NULL,
	"radio_entrega_km" double precision DEFAULT 5 NOT NULL,
	"qr_pago_url" text,
	"qr_pago_instrucciones" text,
	"activa" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sedes_tarifa_ck" CHECK ("sedes"."tarifa_domicilio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"ip" text,
	"user_agent" text,
	"expira_en" timestamp with time zone NOT NULL,
	"revocada_en" timestamp with time zone,
	"motivo_revocacion" text,
	"ultimo_uso_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suscripciones_push" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"usuario_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tokens_refresco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sesion_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"usado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"password_hash" text,
	"email_verificado_en" timestamp with time zone,
	"rol" text DEFAULT 'cliente' NOT NULL,
	"sede_id" uuid,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"acepto_privacidad_en" timestamp with time zone,
	"version_privacidad" text,
	"whatsapp_habilitado" boolean DEFAULT false NOT NULL,
	"ultimo_ingreso_en" timestamp with time zone,
	"credenciales_cambiadas_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_minusculas_ck" CHECK ("usuarios"."email" = lower("usuarios"."email")),
	CONSTRAINT "usuarios_rol_ck" CHECK ("usuarios"."rol" in ('cliente','mesero','cocina','caja','domiciliario','admin')),
	CONSTRAINT "usuarios_sede_empleado_ck" CHECK ("usuarios"."rol" in ('cliente','admin') or "usuarios"."sede_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_mensajes" (
	"wamid" text PRIMARY KEY NOT NULL,
	"telefono" text NOT NULL,
	"tipo" text NOT NULL,
	"estado" text DEFAULT 'recibido' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"procesado_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_actor_id_usuarios_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buzon_mensajes" ADD CONSTRAINT "buzon_mensajes_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buzon_mensajes" ADD CONSTRAINT "buzon_mensajes_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direcciones_cliente" ADD CONSTRAINT "direcciones_cliente_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidades_oauth" ADD CONSTRAINT "identidades_oauth_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_invitado_por_usuarios_id_fk" FOREIGN KEY ("invitado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_sede" ADD CONSTRAINT "menu_sede_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_sede" ADD CONSTRAINT "menu_sede_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_eventos" ADD CONSTRAINT "pedido_eventos_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_eventos" ADD CONSTRAINT "pedido_eventos_actor_id_usuarios_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_items" ADD CONSTRAINT "pedido_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_suscripciones" ADD CONSTRAINT "pedido_suscripciones_pedido_id_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_suscripciones" ADD CONSTRAINT "pedido_suscripciones_suscripcion_id_suscripciones_push_id_fk" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones_push"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_domiciliario_id_usuarios_id_fk" FOREIGN KEY ("domiciliario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_recorrido_id_recorridos_id_fk" FOREIGN KEY ("recorrido_id") REFERENCES "public"."recorridos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorridos" ADD CONSTRAINT "recorridos_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recorridos" ADD CONSTRAINT "recorridos_domiciliario_id_usuarios_id_fk" FOREIGN KEY ("domiciliario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_refresco" ADD CONSTRAINT "tokens_refresco_sesion_id_sesiones_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "auditoria_entidad_idx" ON "auditoria" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "buzon_estado_idx" ON "buzon_mensajes" USING btree ("estado","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_slug_uq" ON "categorias" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "codigos_email_proposito_idx" ON "codigos_verificacion" USING btree ("email","proposito","creado_en");--> statement-breakpoint
CREATE INDEX "direcciones_usuario_idx" ON "direcciones_cliente" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identidades_proveedor_sujeto_uq" ON "identidades_oauth" USING btree ("proveedor","sujeto");--> statement-breakpoint
CREATE INDEX "identidades_usuario_idx" ON "identidades_oauth" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insumos_nombre_uq" ON "insumos" USING btree ("nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "invitaciones_token_uq" ON "invitaciones" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitaciones_email_idx" ON "invitaciones" USING btree ("email");--> statement-breakpoint
CREATE INDEX "movimientos_sede_fecha_idx" ON "movimientos_inventario" USING btree ("sede_id","creado_en");--> statement-breakpoint
CREATE INDEX "movimientos_pedido_idx" ON "movimientos_inventario" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pagos_pedido_idx" ON "pagos" USING btree ("pedido_id");--> statement-breakpoint
CREATE INDEX "pedido_eventos_pedido_idx" ON "pedido_eventos" USING btree ("pedido_id","creado_en");--> statement-breakpoint
CREATE INDEX "pedido_items_pedido_idx" ON "pedido_items" USING btree ("pedido_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_numero_uq" ON "pedidos" USING btree ("numero");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_idempotencia_uq" ON "pedidos" USING btree ("clave_idempotencia");--> statement-breakpoint
CREATE INDEX "pedidos_sede_estado_idx" ON "pedidos" USING btree ("sede_id","estado");--> statement-breakpoint
CREATE INDEX "pedidos_sede_fecha_idx" ON "pedidos" USING btree ("sede_id","creado_en");--> statement-breakpoint
CREATE INDEX "pedidos_cliente_idx" ON "pedidos" USING btree ("cliente_id","creado_en");--> statement-breakpoint
CREATE INDEX "pedidos_domiciliario_idx" ON "pedidos" USING btree ("domiciliario_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_slug_uq" ON "productos" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "productos_categoria_idx" ON "productos" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "recorridos_domiciliario_idx" ON "recorridos" USING btree ("domiciliario_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "recorridos_un_activo_uq" ON "recorridos" USING btree ("domiciliario_id") WHERE "recorridos"."estado" = 'activo';--> statement-breakpoint
CREATE UNIQUE INDEX "sedes_slug_uq" ON "sedes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suscripciones_endpoint_uq" ON "suscripciones_push" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "suscripciones_usuario_idx" ON "suscripciones_push" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_refresco_hash_uq" ON "tokens_refresco" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "tokens_refresco_sesion_idx" ON "tokens_refresco" USING btree ("sesion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE INDEX "usuarios_telefono_idx" ON "usuarios" USING btree ("telefono");--> statement-breakpoint
CREATE INDEX "usuarios_rol_sede_idx" ON "usuarios" USING btree ("rol","sede_id");