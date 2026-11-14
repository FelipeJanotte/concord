CREATE TABLE "sounds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"emoji" text,
	"uploader_id" uuid,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sounds_name_check" CHECK (char_length("sounds"."name") between 1 and 32),
	CONSTRAINT "sounds_emoji_check" CHECK ("sounds"."emoji" is null or char_length("sounds"."emoji") between 1 and 8),
	CONSTRAINT "sounds_size_check" CHECK ("sounds"."size" between 1 and 524288),
	CONSTRAINT "sounds_duration_check" CHECK ("sounds"."duration_ms" between 1 and 5000),
	CONSTRAINT "sounds_type_check" CHECK ("sounds"."content_type" in ('audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'))
);
--> statement-breakpoint
ALTER TABLE "sounds" ADD CONSTRAINT "sounds_uploader_id_accounts_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sounds_name_lower_key" ON "sounds" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "sounds_uploader_id_idx" ON "sounds" USING btree ("uploader_id");