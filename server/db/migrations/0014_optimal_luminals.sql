CREATE TABLE "saved_playlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"kind" text NOT NULL,
	"saved_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_playlists_name_check" CHECK (char_length("saved_playlists"."name") between 1 and 60),
	CONSTRAINT "saved_playlists_kind_check" CHECK ("saved_playlists"."kind" in ('playlist', 'album'))
);
--> statement-breakpoint
ALTER TABLE "saved_playlists" ADD CONSTRAINT "saved_playlists_saved_by_accounts_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_playlists_name_lower_key" ON "saved_playlists" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "saved_playlists_url_key" ON "saved_playlists" USING btree ("url");--> statement-breakpoint
CREATE INDEX "saved_playlists_saved_by_idx" ON "saved_playlists" USING btree ("saved_by");