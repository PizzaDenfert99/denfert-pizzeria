-- Pizza Denfert — self-hosted Postgres schema (replaces Supabase Postgres).
-- Idempotent: safe to re-run manually against an existing database (all
-- statements use IF NOT EXISTS / DROP ... IF EXISTS + CREATE). Postgres's own
-- /docker-entrypoint-initdb.d/ mechanism only auto-runs this on a *fresh*
-- volume, so re-running by hand during iteration must not error out.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL UNIQUE,
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_active_sort
    ON categories (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_items (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    description   text,
    ingredients   jsonb NOT NULL DEFAULT '[]'::jsonb,
    prices        jsonb NOT NULL DEFAULT '{}'::jsonb,
    image_url     text,
    thumbnail_url text,
    category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
    sort_order    integer NOT NULL DEFAULT 0,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_ingredients_is_array CHECK (jsonb_typeof(ingredients) = 'array'),
    CONSTRAINT chk_prices_is_object CHECK (jsonb_typeof(prices) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_menu_items_active_sort
    ON menu_items (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id
    ON menu_items (category_id);

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- restaurant_settings (singleton table — enforced at the app level, same as
-- it was via PostgREST `select=*&limit=1`, not by a DB constraint here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    address              text,
    phone                text,
    opening_hours        jsonb NOT NULL DEFAULT '{}'::jsonb,
    hero_image_url       text,
    bg_home_url          text,
    bg_reservations_url  text,
    bg_account_url       text,
    bg_menu_url          text,
    updated_at           timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_restaurant_settings_updated_at ON restaurant_settings;
CREATE TRIGGER trg_restaurant_settings_updated_at
    BEFORE UPDATE ON restaurant_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
