-- Executable defense-in-depth policies. Run as the migration owner AFTER Drizzle migrations.
-- dz_runtime and dz_push_worker are created by scripts/migrate.ts, never BYPASSRLS or superusers.
-- Identity GUCs are set with set_config(..., true) inside every application transaction.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$ SELECT COALESCE(NULLIF(current_setting('app.role', true), ''), 'anonymous') $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','wilayas','categories','products','offers','escrow_transactions','disputes','conversations','messages','price_history','push_subscriptions','sessions','rate_limits','product_views','saved_searches','notifications','notification_jobs','media'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS migration_owner ON %I', t);
    EXECUTE format('CREATE POLICY migration_owner ON %I TO %I USING (true) WITH CHECK (true)', t, current_user);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON %I FROM dz_runtime, dz_push_worker', t);
  END LOOP;
END $$;

-- Public reference data.
DROP POLICY IF EXISTS reference_read ON wilayas;
CREATE POLICY reference_read ON wilayas FOR SELECT USING (active);
DROP POLICY IF EXISTS reference_read ON categories;
CREATE POLICY reference_read ON categories FOR SELECT USING (active);
GRANT SELECT ON wilayas, categories TO dz_runtime;

-- Runtime receives only public user columns, never password/email/phone/preferences.
DROP POLICY IF EXISTS users_public_or_self ON users;
CREATE POLICY users_public_or_self ON users FOR SELECT USING (is_active OR id = app_user_id() OR app_role() IN ('admin','support'));
GRANT SELECT (id, display_name, avatar_url, trust_tier, verified_at, created_at) ON users TO dz_runtime;

DROP POLICY IF EXISTS products_read ON products;
CREATE POLICY products_read ON products FOR SELECT USING (status = 'active' OR seller_id = app_user_id() OR app_role() IN ('admin','support'));
DROP POLICY IF EXISTS products_insert ON products;
CREATE POLICY products_insert ON products FOR INSERT WITH CHECK (seller_id = app_user_id() AND app_role() IN ('seller','admin') AND status IN ('draft','active'));
DROP POLICY IF EXISTS products_update ON products;
CREATE POLICY products_update ON products FOR UPDATE USING (seller_id = app_user_id() OR app_role() = 'admin') WITH CHECK (seller_id = app_user_id() OR app_role() = 'admin');
GRANT SELECT ON products TO dz_runtime;
GRANT INSERT ON products TO dz_runtime;
-- View counters are incremented only by the pinned SECURITY DEFINER record_product_view RPC.
GRANT UPDATE (title,description,price_dzd,cost_dzd,category_id,wilaya_id,commune,condition,status,images,attributes,delivery_available,latitude,longitude,updated_at) ON products TO dz_runtime;
CREATE OR REPLACE FUNCTION protect_product_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (NEW.escrow_eligible IS DISTINCT FROM OLD.escrow_eligible AND app_role() <> 'admin') THEN RAISE EXCEPTION 'immutable_field'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS products_protect_fields ON products;
CREATE TRIGGER products_protect_fields BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION protect_product_fields();

DROP POLICY IF EXISTS offers_read ON offers;
CREATE POLICY offers_read ON offers FOR SELECT USING (buyer_id = app_user_id() OR seller_id = app_user_id() OR app_role() IN ('admin','support'));
DROP POLICY IF EXISTS offers_insert ON offers;
CREATE POLICY offers_insert ON offers FOR INSERT WITH CHECK (
  buyer_id = app_user_id() AND buyer_id <> seller_id AND amount_dzd > 0
  AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.seller_id = offers.seller_id AND p.status = 'active')
);
DROP POLICY IF EXISTS offers_update ON offers;
CREATE POLICY offers_update ON offers FOR UPDATE USING (
  (seller_id = app_user_id() AND status IN ('pending','accepted','rejected','countered','expired')) OR (buyer_id = app_user_id() AND status IN ('pending','accepted','rejected','countered','expired'))
) WITH CHECK (
  (seller_id = app_user_id() AND status IN ('accepted','rejected','countered')) OR (buyer_id = app_user_id() AND status = 'withdrawn')
);
GRANT SELECT ON offers TO dz_runtime;
GRANT INSERT ON offers TO dz_runtime;
GRANT UPDATE ON offers TO dz_runtime;
CREATE OR REPLACE FUNCTION protect_offer_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id OR NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.amount_dzd IS DISTINCT FROM OLD.amount_dzd OR NEW.request_key IS DISTINCT FROM OLD.request_key OR NEW.message IS DISTINCT FROM OLD.message OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN RAISE EXCEPTION 'immutable_field'; END IF;
  IF OLD.status <> 'pending' OR (OLD.expires_at IS NOT NULL AND OLD.expires_at < now()) THEN RAISE EXCEPTION 'offer_transition'; END IF;
  IF NEW.status='withdrawn' AND app_user_id() IS DISTINCT FROM OLD.buyer_id THEN RAISE EXCEPTION 'offer_transition'; END IF;
  IF NEW.status<>'withdrawn' AND app_user_id() IS DISTINCT FROM OLD.seller_id THEN RAISE EXCEPTION 'offer_transition'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS offers_protect_fields ON offers;
CREATE TRIGGER offers_protect_fields BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION protect_offer_fields();
GRANT SELECT ON product_views TO dz_runtime;
DROP POLICY IF EXISTS product_views_seller_read ON product_views;
CREATE POLICY product_views_seller_read ON product_views FOR SELECT USING (EXISTS (SELECT 1 FROM products p WHERE p.id=product_id AND p.seller_id=app_user_id()));
GRANT SELECT, INSERT ON price_history TO dz_runtime;
DROP POLICY IF EXISTS price_history_read ON price_history;
CREATE POLICY price_history_read ON price_history FOR SELECT USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id));
DROP POLICY IF EXISTS price_history_insert ON price_history;
CREATE POLICY price_history_insert ON price_history FOR INSERT WITH CHECK (price_dzd > 0 AND EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND (p.seller_id = app_user_id() OR app_role() = 'admin')));

-- Uploaded listing media. Public bytes are served only through /api/media/[id]; owners may insert/delete their own rows.
DROP POLICY IF EXISTS media_public_read ON media;
CREATE POLICY media_public_read ON media FOR SELECT USING (true);
DROP POLICY IF EXISTS media_owner_insert ON media;
CREATE POLICY media_owner_insert ON media FOR INSERT WITH CHECK (owner_id = app_user_id() AND app_role() IN ('seller','admin') AND byte_size > 0 AND byte_size <= 2097152 AND content_type IN ('image/webp','image/jpeg','image/png'));
DROP POLICY IF EXISTS media_owner_delete ON media;
CREATE POLICY media_owner_delete ON media FOR DELETE USING (owner_id = app_user_id() OR app_role() = 'admin');
GRANT SELECT, INSERT, DELETE ON media TO dz_runtime;

-- Participant-only private records. No client write path to financial state.
DROP POLICY IF EXISTS escrow_read ON escrow_transactions;
CREATE POLICY escrow_read ON escrow_transactions FOR SELECT USING (buyer_id = app_user_id() OR seller_id = app_user_id() OR app_role() IN ('admin','support'));
GRANT SELECT ON escrow_transactions TO dz_runtime;
DROP POLICY IF EXISTS disputes_read ON disputes;
CREATE POLICY disputes_read ON disputes FOR SELECT USING (opened_by = app_user_id() OR EXISTS (SELECT 1 FROM escrow_transactions e WHERE e.id = escrow_id AND (e.buyer_id = app_user_id() OR e.seller_id = app_user_id())) OR app_role() IN ('admin','support'));
GRANT SELECT ON disputes TO dz_runtime;
DROP POLICY IF EXISTS conversations_participant ON conversations;
CREATE POLICY conversations_participant ON conversations FOR ALL USING (buyer_id = app_user_id() OR seller_id = app_user_id()) WITH CHECK (buyer_id = app_user_id() OR seller_id = app_user_id());
GRANT SELECT, INSERT, UPDATE ON conversations TO dz_runtime;
DROP POLICY IF EXISTS messages_read ON messages;
CREATE POLICY messages_read ON messages FOR SELECT USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND (c.buyer_id = app_user_id() OR c.seller_id = app_user_id())));
DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (sender_id = app_user_id() AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND (c.buyer_id = app_user_id() OR c.seller_id = app_user_id())));
GRANT SELECT ON messages TO dz_runtime;
GRANT INSERT ON messages TO dz_runtime;

DROP POLICY IF EXISTS push_owner ON push_subscriptions;
CREATE POLICY push_owner ON push_subscriptions FOR ALL USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT, INSERT, DELETE ON push_subscriptions TO dz_runtime;
GRANT UPDATE (keys,user_agent,locale,updated_at) ON push_subscriptions TO dz_runtime;
DROP POLICY IF EXISTS saved_search_owner ON saved_searches;
CREATE POLICY saved_search_owner ON saved_searches FOR ALL USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT, INSERT, DELETE ON saved_searches TO dz_runtime;
DROP POLICY IF EXISTS notifications_read ON notifications;
CREATE POLICY notifications_read ON notifications FOR SELECT USING (user_id = app_user_id());
DROP POLICY IF EXISTS notifications_mark_read ON notifications;
CREATE POLICY notifications_mark_read ON notifications FOR UPDATE USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());
GRANT SELECT ON notifications TO dz_runtime;
GRANT UPDATE (read_at) ON notifications TO dz_runtime;

-- Worker cannot read user profiles, offers, messages or financial records.
DROP POLICY IF EXISTS push_worker_subscriptions ON push_subscriptions;
CREATE POLICY push_worker_subscriptions ON push_subscriptions FOR SELECT TO dz_push_worker USING (true);
DROP POLICY IF EXISTS push_worker_delete_expired ON push_subscriptions;
CREATE POLICY push_worker_delete_expired ON push_subscriptions FOR DELETE TO dz_push_worker USING (true);
GRANT SELECT, DELETE ON push_subscriptions TO dz_push_worker;
DROP POLICY IF EXISTS push_worker_notifications ON notifications;
CREATE POLICY push_worker_notifications ON notifications FOR SELECT TO dz_push_worker USING (true);
GRANT SELECT ON notifications TO dz_push_worker;
DROP POLICY IF EXISTS push_worker_jobs ON notification_jobs;
CREATE POLICY push_worker_jobs ON notification_jobs FOR ALL TO dz_push_worker USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_jobs TO dz_push_worker;

-- Narrow SECURITY DEFINER auth/rate/view RPCs. Pins search_path; no arbitrary SQL input.
CREATE OR REPLACE FUNCTION register_account(p_email varchar, p_hash text, p_name varchar, p_role user_role, p_locale varchar)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE uid uuid;
BEGIN
  IF p_role NOT IN ('buyer','seller') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  INSERT INTO users(email,password_hash,display_name,role,locale) VALUES (p_email,p_hash,p_name,p_role,p_locale) RETURNING id INTO uid;
  RETURN uid;
END $$;
CREATE OR REPLACE FUNCTION authenticate_account(p_email varchar)
RETURNS TABLE(id uuid, password_hash text) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id,password_hash FROM users WHERE email=p_email AND is_active AND password_hash IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION create_session(p_hash varchar, p_user uuid, p_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_seconds <= 0 OR p_seconds > 604800 THEN RAISE EXCEPTION 'invalid_ttl'; END IF;
  DELETE FROM sessions WHERE expires_at < now();
  INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(p_hash,p_user,now()+make_interval(secs=>p_seconds));
END $$;
CREATE OR REPLACE FUNCTION resolve_session(p_hash varchar)
RETURNS TABLE(id uuid,display_name varchar,role user_role,locale varchar,email_verified_at timestamptz,preferences jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT u.id,u.display_name,u.role,u.locale,u.email_verified_at,u.preferences FROM sessions s JOIN users u ON u.id=s.user_id
  WHERE s.token_hash=p_hash AND s.expires_at>now() AND u.is_active
$$;
CREATE OR REPLACE FUNCTION revoke_session(p_hash varchar) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ DELETE FROM sessions WHERE token_hash=p_hash $$;
CREATE OR REPLACE FUNCTION update_preferences(p_user uuid,p_preferences jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_user IS DISTINCT FROM app_user_id() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF jsonb_typeof(p_preferences->'offers') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_preferences->'listings') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_preferences->'push') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'invalid_preferences'; END IF;
  UPDATE users SET preferences=p_preferences,updated_at=now() WHERE id=p_user;
END $$;
CREATE OR REPLACE FUNCTION consume_rate_limit(p_key varchar,p_limit integer,p_window_ms integer)
RETURNS TABLE(allowed boolean,retry_after integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE bucket rate_limits%ROWTYPE;
BEGIN
  IF p_limit < 1 OR p_window_ms < 1 THEN RAISE EXCEPTION 'invalid_limit'; END IF;
  INSERT INTO rate_limits(key,hits,resets_at) VALUES(p_key,1,now()+(p_window_ms * interval '1 millisecond'))
  ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.resets_at<=now() THEN 1 ELSE rate_limits.hits+1 END,
    resets_at=CASE WHEN rate_limits.resets_at<=now() THEN now()+(p_window_ms * interval '1 millisecond') ELSE rate_limits.resets_at END
  RETURNING * INTO bucket;
  RETURN QUERY SELECT bucket.hits<=p_limit, GREATEST(1,ceil(extract(epoch from(bucket.resets_at-now())))::integer);
END $$;
CREATE OR REPLACE FUNCTION record_product_view(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE products SET view_count=view_count+1 WHERE id=p_id AND status='active';
  IF FOUND THEN INSERT INTO product_views(product_id,day,count) VALUES(p_id,date_trunc('day',now() at time zone 'Africa/Algiers') at time zone 'Africa/Algiers',1)
    ON CONFLICT(product_id,day) DO UPDATE SET count=product_views.count+1;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS product_views_pkey ON product_views(product_id,day);

CREATE OR REPLACE FUNCTION enqueue_notification(p_user uuid,p_kind varchar,p_subject uuid,p_data jsonb,p_url text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE nid uuid; prefs jsonb;
BEGIN
  IF p_kind='test' AND p_user IS DISTINCT FROM app_user_id() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO notifications(user_id,kind,subject_id,data,url) VALUES(p_user,p_kind,p_subject,p_data,p_url)
  ON CONFLICT(user_id,kind,subject_id) DO UPDATE SET data=EXCLUDED.data,read_at=NULL,created_at=now() RETURNING id INTO nid;
  SELECT preferences INTO prefs FROM users WHERE id=p_user;
  IF COALESCE((prefs->>'push')::boolean,false) AND (p_kind NOT IN ('offer','offer_update') OR COALESCE((prefs->>'offers')::boolean,true)) AND (p_kind <> 'listing' OR COALESCE((prefs->>'listings')::boolean,true)) THEN
    INSERT INTO notification_jobs(notification_id) VALUES(nid)
    ON CONFLICT(notification_id) DO UPDATE SET attempts=CASE WHEN notification_jobs.completed_at IS NULL THEN notification_jobs.attempts ELSE 0 END,available_at=now(),locked_at=NULL,completed_at=NULL,last_error=NULL;
  END IF;
  RETURN nid;
END $$;
CREATE OR REPLACE FUNCTION notify_offer_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM enqueue_notification(NEW.seller_id,'offer',NEW.id,jsonb_build_object('amount',NEW.amount_dzd,'productId',NEW.product_id),'/dashboard?tab=offers');
  ELSE
    PERFORM enqueue_notification(CASE WHEN NEW.status='withdrawn' THEN NEW.seller_id ELSE NEW.buyer_id END,'offer_update',NEW.id,jsonb_build_object('status',NEW.status,'productId',NEW.product_id),'/dashboard?tab=offers');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS offers_notify ON offers;
CREATE TRIGGER offers_notify AFTER INSERT OR UPDATE OF status ON offers FOR EACH ROW EXECUTE FUNCTION notify_offer_change();
CREATE OR REPLACE FUNCTION notify_matching_listing() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status='active' THEN
    PERFORM enqueue_notification(s.user_id,'listing',NEW.id,jsonb_build_object('productId',NEW.id),'/product/'||NEW.id)
    FROM saved_searches s JOIN users u ON u.id=s.user_id LEFT JOIN wilayas w ON w.id=NEW.wilaya_id
    WHERE s.user_id<>NEW.seller_id AND u.is_active AND (u.preferences->>'listings')::boolean
      AND (s.wilaya_code IS NULL OR s.wilaya_code=w.code) AND (s.category_id IS NULL OR s.category_id=NEW.category_id)
      AND (s.max_price IS NULL OR NEW.price_dzd<=s.max_price) AND (s.query='' OR NEW.title ILIKE '%'||replace(replace(s.query,'%','\%'),'_','\_')||'%');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS listings_notify ON products;
CREATE TRIGGER listings_notify AFTER INSERT ON products FOR EACH ROW EXECUTE FUNCTION notify_matching_listing();

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_id(),app_role() TO dz_runtime,dz_push_worker;
REVOKE EXECUTE ON FUNCTION protect_product_fields(),notify_offer_change(),notify_matching_listing(),protect_offer_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_account(varchar,text,varchar,user_role,varchar),authenticate_account(varchar),create_session(varchar,uuid,integer),resolve_session(varchar),revoke_session(varchar),consume_rate_limit(varchar,integer,integer),record_product_view(uuid) TO dz_runtime;
GRANT EXECUTE ON FUNCTION update_preferences(uuid,jsonb),enqueue_notification(uuid,varchar,uuid,jsonb,text) TO dz_runtime;
GRANT USAGE ON SCHEMA public TO dz_runtime,dz_push_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Single-use codes that carry a browser sign-in back into the Android app.
-- The 32-byte code is the capability: only its SHA-256 is stored, so reaching the
-- table reveals nothing replayable. The row is minted by the browser (authenticated)
-- and consumed by the app before it has a session, hence the time-boxed predicate
-- rather than app_user_id().
-- Consuming a code flips `used_at`, so the WITH CHECK must allow that transition:
-- the unguessable 256-bit code (never stored) is what scopes access, not a column.
DROP POLICY IF EXISTS app_handoff_capability ON app_handoff_codes;
CREATE POLICY app_handoff_capability ON app_handoff_codes TO dz_runtime
  USING (expires_at > now()) WITH CHECK (expires_at > now());
DROP POLICY IF EXISTS app_handoff_capability_read ON app_handoff_codes;
CREATE POLICY app_handoff_capability_read ON app_handoff_codes FOR SELECT TO dz_runtime
  USING (expires_at > now());
GRANT SELECT, INSERT, UPDATE ON app_handoff_codes TO dz_runtime;
