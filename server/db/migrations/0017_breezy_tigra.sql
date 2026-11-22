CREATE TABLE "pokemon_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"item" text,
	"quantity" integer NOT NULL,
	"mon" jsonb,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pokemon_listings_price_check" CHECK ("pokemon_listings"."price" > 0),
	CONSTRAINT "pokemon_listings_quantity_check" CHECK ("pokemon_listings"."quantity" > 0),
	CONSTRAINT "pokemon_listings_kind_check" CHECK (("pokemon_listings"."item" is null) <> ("pokemon_listings"."mon" is null))
);
--> statement-breakpoint
CREATE TABLE "pokemon_saves" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pokemon_listings" ADD CONSTRAINT "pokemon_listings_seller_id_accounts_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon_saves" ADD CONSTRAINT "pokemon_saves_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pokemon_listings_seller_idx" ON "pokemon_listings" USING btree ("seller_id");