CREATE TABLE "channel_overrides" (
	"channel_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"allow" text[] DEFAULT '{}'::text[] NOT NULL,
	"deny" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "channel_overrides_channel_id_role_id_pk" PRIMARY KEY("channel_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "member_roles" (
	"account_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "member_roles_account_id_role_id_pk" PRIMARY KEY("account_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"position" integer NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "roles_name_check" CHECK (char_length("roles"."name") between 1 and 32),
	CONSTRAINT "roles_color_check" CHECK ("roles"."color" is null or "roles"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "roles_position_check" CHECK ("roles"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD CONSTRAINT "channel_overrides_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_overrides" ADD CONSTRAINT "channel_overrides_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_roles" ADD CONSTRAINT "member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_overrides_role_id_idx" ON "channel_overrides" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "member_roles_role_id_idx" ON "member_roles" USING btree ("role_id");