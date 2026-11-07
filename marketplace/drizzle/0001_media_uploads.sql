CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_byte_size_positive" CHECK ("media"."byte_size" > 0 AND "media"."byte_size" <= 2097152)
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_created_idx" ON "media" USING btree ("owner_id","created_at");