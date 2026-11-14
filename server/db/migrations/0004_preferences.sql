CREATE TABLE "account_preferences" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"theme" jsonb NOT NULL,
	"saved_themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;