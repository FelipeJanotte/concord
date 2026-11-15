CREATE TABLE "server_mutes" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"muted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_mutes" ADD CONSTRAINT "server_mutes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_mutes" ADD CONSTRAINT "server_mutes_muted_by_accounts_id_fk" FOREIGN KEY ("muted_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;