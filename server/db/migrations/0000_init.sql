CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"tag_locked" boolean DEFAULT true NOT NULL,
	"color" text NOT NULL,
	"password_hash" text,
	"google_id" text,
	"avatar_type" text,
	"avatar_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_type_check" CHECK ("channels"."type" in ('text', 'voice')),
	CONSTRAINT "channels_name_check" CHECK (char_length("channels"."name") between 1 and 32)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"author_tag" text DEFAULT '' NOT NULL,
	"author_color" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_content_check" CHECK (char_length("messages"."content") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_tag_lower_key" ON "accounts" USING btree (lower("tag"));--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_google_id_key" ON "accounts" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "sessions_account_id_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_type_name_lower_key" ON "channels" USING btree ("type",lower("name"));--> statement-breakpoint
CREATE INDEX "messages_channel_seq_idx" ON "messages" USING btree ("channel_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_author_id_idx" ON "messages" USING btree ("author_id");