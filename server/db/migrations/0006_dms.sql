CREATE TABLE "channel_members" (
	"channel_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "channel_members_channel_id_account_id_pk" PRIMARY KEY("channel_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "channels" DROP CONSTRAINT "channels_type_check";--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_members_account_id_idx" ON "channel_members" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_type_check" CHECK ("channels"."type" in ('text', 'voice', 'dm'));