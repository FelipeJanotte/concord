ALTER TABLE "messages" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to_id" uuid;