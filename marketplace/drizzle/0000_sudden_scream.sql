CREATE TYPE "public"."dispute_status" AS ENUM('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'closed');--> statement-breakpoint
CREATE TYPE "public"."escrow_status" AS ENUM('payment_pending', 'funds_held', 'in_transit', 'buyer_confirmed', 'released', 'disputed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."product_condition" AS ENUM('new', 'like_new', 'good', 'fair', 'for_parts');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'reserved', 'sold', 'archived');--> statement-breakpoint
CREATE TYPE "public"."trust_tier" AS ENUM('unverified', 'tier_1', 'tier_2', 'tier_3');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'seller', 'admin', 'support');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name_en" varchar(100) NOT NULL,
	"name_fr" varchar(100) NOT NULL,
	"name_ar" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"icon" varchar(80),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escrow_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"reason" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escrow_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount_dzd" numeric(14, 2) NOT NULL,
	"status" "escrow_status" DEFAULT 'payment_pending' NOT NULL,
	"payment_provider" varchar(60),
	"provider_reference" varchar(180),
	"delivery_otp_hash" text,
	"held_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"message_type" varchar(24) DEFAULT 'text' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" varchar(80),
	CONSTRAINT "notification_jobs_notification_id_unique" UNIQUE("notification_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"subject_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"url" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"request_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"counter_amount_dzd" numeric(14, 2),
	"amount_dzd" numeric(14, 2) NOT NULL,
	"message" varchar(500),
	"status" "offer_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_amount_positive" CHECK ("offers"."amount_dzd" > 0),
	CONSTRAINT "offers_distinct_participants" CHECK ("offers"."buyer_id" <> "offers"."seller_id")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"price_dzd" numeric(14, 2) NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_views" (
	"product_id" uuid NOT NULL,
	"day" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"category_id" uuid,
	"wilaya_id" uuid,
	"commune" varchar(120),
	"title" varchar(180) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_dzd" numeric(14, 2) NOT NULL,
	"condition" "product_condition" DEFAULT 'good' NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"escrow_eligible" boolean DEFAULT false NOT NULL,
	"delivery_available" boolean DEFAULT true NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"cost_dzd" numeric(14, 2),
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(commune,''))) STORED,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price_dzd" > 0),
	CONSTRAINT "products_cost_nonnegative" CHECK ("products"."cost_dzd" IS NULL OR "products"."cost_dzd" >= 0),
	CONSTRAINT "products_images_array" CHECK (jsonb_typeof("products"."images") = 'array' AND jsonb_array_length("products"."images") <= 8)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"locale" varchar(2) DEFAULT 'fr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query" varchar(100) DEFAULT '' NOT NULL,
	"wilaya_code" varchar(2),
	"category_id" uuid,
	"max_price" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320),
	"phone" varchar(24),
	"display_name" varchar(120) NOT NULL,
	"avatar_url" text,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"trust_tier" "trust_tier" DEFAULT 'unverified' NOT NULL,
	"verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"locale" varchar(2) DEFAULT 'fr' NOT NULL,
	"preferences" jsonb DEFAULT '{"offers":true,"listings":true,"push":false}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wilayas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(2) NOT NULL,
	"name_en" varchar(80) NOT NULL,
	"name_fr" varchar(80) NOT NULL,
	"name_ar" varchar(100) NOT NULL,
	"center_lat" numeric(9, 6),
	"center_lng" numeric(9, 6),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escrow_id_escrow_transactions_id_fk" FOREIGN KEY ("escrow_id") REFERENCES "public"."escrow_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escrow_transactions" ADD CONSTRAINT "escrow_transactions_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_views" ADD CONSTRAINT "product_views_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_wilaya_id_wilayas_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "public"."wilayas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "conversations_buyer_updated_idx" ON "conversations" USING btree ("buyer_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_seller_updated_idx" ON "conversations" USING btree ("seller_id","updated_at");--> statement-breakpoint
CREATE INDEX "disputes_escrow_idx" ON "disputes" USING btree ("escrow_id");--> statement-breakpoint
CREATE INDEX "disputes_status_created_idx" ON "disputes" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "escrow_buyer_status_idx" ON "escrow_transactions" USING btree ("buyer_id","status");--> statement-breakpoint
CREATE INDEX "escrow_seller_status_idx" ON "escrow_transactions" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_jobs_ready_idx" ON "notification_jobs" USING btree ("available_at","locked_at");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("user_id","kind","subject_id");--> statement-breakpoint
CREATE INDEX "offers_product_status_idx" ON "offers" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "offers_buyer_created_idx" ON "offers" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "offers_seller_created_idx" ON "offers" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_idempotency_unique" ON "offers" USING btree ("buyer_id","request_key");--> statement-breakpoint
CREATE INDEX "price_history_product_time_idx" ON "price_history" USING btree ("product_id","captured_at");--> statement-breakpoint
CREATE INDEX "product_views_product_day_idx" ON "product_views" USING btree ("product_id","day");--> statement-breakpoint
CREATE INDEX "products_status_created_idx" ON "products" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "products_seller_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_wilaya_idx" ON "products" USING btree ("wilaya_id");--> statement-breakpoint
CREATE INDEX "products_price_idx" ON "products" USING btree ("price_dzd");--> statement-breakpoint
CREATE INDEX "products_search_gin" ON "products" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "products_title_trgm" ON "products" USING gin (title gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_searches_unique" ON "saved_searches" USING btree ("user_id","query","wilaya_code","category_id","max_price");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_unique" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "wilayas_code_unique" ON "wilayas" USING btree ("code");