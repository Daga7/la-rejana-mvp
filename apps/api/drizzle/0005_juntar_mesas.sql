ALTER TABLE "cuentas_mesa" DROP CONSTRAINT "cuentas_mesa_estado_ck";--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD COLUMN "unida_a" uuid;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "cuenta_unida_id" uuid;--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_unida_a_cuentas_mesa_id_fk" FOREIGN KEY ("unida_a") REFERENCES "public"."cuentas_mesa"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_cuenta_unida_id_cuentas_mesa_id_fk" FOREIGN KEY ("cuenta_unida_id") REFERENCES "public"."cuentas_mesa"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_unida_ck" CHECK (("cuentas_mesa"."estado" = 'unida') = ("cuentas_mesa"."unida_a" is not null));--> statement-breakpoint
ALTER TABLE "cuentas_mesa" ADD CONSTRAINT "cuentas_mesa_estado_ck" CHECK ("cuentas_mesa"."estado" in ('abierta','cerrada','cancelada','unida'));