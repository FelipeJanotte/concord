ALTER TABLE "messages" ADD COLUMN "kind" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tool" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check" CHECK ("messages"."kind" in ('text', 'tool'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tool_check" CHECK (("messages"."kind" = 'tool') = ("messages"."tool" is not null));