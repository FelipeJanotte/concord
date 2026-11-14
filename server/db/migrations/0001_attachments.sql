CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"uploader_id" uuid,
	"message_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_size_check" CHECK ("attachments"."size" between 1 and 26214400),
	CONSTRAINT "attachments_name_check" CHECK (char_length("attachments"."name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_content_check";--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_accounts_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_message_id_idx" ON "attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX "attachments_unattached_idx" ON "attachments" USING btree ("created_at") WHERE "attachments"."message_id" is null;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_content_check" CHECK (char_length("messages"."content") <= 2000);