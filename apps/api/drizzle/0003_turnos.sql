CREATE TABLE "turnos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"sede_id" uuid NOT NULL,
	"entrada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"salida_en" timestamp with time zone,
	"cerrado_por" uuid,
	"nota" text,
	CONSTRAINT "turnos_salida_ck" CHECK ("turnos"."salida_en" is null or "turnos"."salida_en" > "turnos"."entrada_en")
);
--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sede_id_sedes_id_fk" FOREIGN KEY ("sede_id") REFERENCES "public"."sedes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "turnos_abierto_uq" ON "turnos" USING btree ("usuario_id") WHERE "turnos"."salida_en" is null;--> statement-breakpoint
CREATE INDEX "turnos_sede_entrada_idx" ON "turnos" USING btree ("sede_id","entrada_en");--> statement-breakpoint
CREATE INDEX "turnos_usuario_entrada_idx" ON "turnos" USING btree ("usuario_id","entrada_en");