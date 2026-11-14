CREATE TABLE "friendships" (
	"account_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	"status" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_account_id_other_id_pk" PRIMARY KEY("account_id","other_id"),
	CONSTRAINT "friendships_status_check" CHECK ("friendships"."status" in ('friend', 'outgoing', 'incoming', 'blocked')),
	CONSTRAINT "friendships_not_self_check" CHECK ("friendships"."account_id" <> "friendships"."other_id")
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_other_id_accounts_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friendships_other_id_idx" ON "friendships" USING btree ("other_id");