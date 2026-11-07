CREATE TABLE "app_handoff_codes" (
	"code_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_handoff_codes" ADD CONSTRAINT "app_handoff_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_handoff_codes_user_idx" ON "app_handoff_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "app_handoff_codes" ENABLE ROW LEVEL SECURITY;
