CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "community_bans" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	"banned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_timeouts" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"timed_out_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_reads" (
	"account_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_read_id" uuid NOT NULL,
	"last_read_seq" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_reads_account_id_channel_id_pk" PRIMARY KEY("account_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_kind_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pinned_by" uuid;--> statement-breakpoint
ALTER TABLE "account_preferences" ADD COLUMN "do_not_disturb" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_bans" ADD CONSTRAINT "community_bans_banned_by_accounts_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_timeouts" ADD CONSTRAINT "server_timeouts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_timeouts" ADD CONSTRAINT "server_timeouts_timed_out_by_accounts_id_fk" FOREIGN KEY ("timed_out_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_reads" ADD CONSTRAINT "channel_reads_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "community_bans_email_idx" ON "community_bans" USING btree ("email");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_pinned_by_accounts_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_content_trgm_idx" ON "messages" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "messages_channel_pinned_idx" ON "messages" USING btree ("channel_id","pinned_at") WHERE "messages"."pinned_at" is not null;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK ("messages"."kind" in ('text', 'tool', 'pin'));