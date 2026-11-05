CREATE TABLE "limites_solicitudes" (
	"clave" text PRIMARY KEY NOT NULL,
	"inicio" timestamp with time zone DEFAULT now() NOT NULL,
	"conteo" integer DEFAULT 1 NOT NULL
);
