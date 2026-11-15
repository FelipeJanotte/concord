CREATE TABLE "poll_votes" (
	"message_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"choice" integer NOT NULL,
	CONSTRAINT "poll_votes_message_id_account_id_choice_pk" PRIMARY KEY("message_id","account_id","choice"),
	CONSTRAINT "poll_votes_choice_check" CHECK ("poll_votes"."choice" between 0 and 9)
);
--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poll_votes_account_id_idx" ON "poll_votes" USING btree ("account_id");