ALTER TABLE "mesas" ADD COLUMN "pos_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "pos_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "ancho" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "alto" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "mesas" ADD COLUMN "forma" text DEFAULT 'cuadrada' NOT NULL;--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_forma_ck" CHECK ("mesas"."forma" in ('cuadrada','redonda','rectangular'));--> statement-breakpoint
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_plano_ck" CHECK ("mesas"."ancho" between 1 and 4 and "mesas"."alto" between 1 and 4 and "mesas"."pos_x" >= 0 and "mesas"."pos_y" >= 0 and "mesas"."pos_x" + "mesas"."ancho" <= 24 and "mesas"."pos_y" + "mesas"."alto" <= 24);--> statement-breakpoint
-- Ubica las mesas que ya existían en una retícula ordenada por zona (columnas cada 3 casillas, 4 por fila).
UPDATE "mesas" SET "pos_x" = 1 + ((x.rn - 1) % 4) * 3, "pos_y" = LEAST(22, 1 + ((x.rn - 1) / 4) * 3)
FROM (SELECT "id", row_number() OVER (PARTITION BY "sede_id", coalesce("zona", '') ORDER BY "numero") AS rn FROM "mesas") AS x
WHERE "mesas"."id" = x."id";
