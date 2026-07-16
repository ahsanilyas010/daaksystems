-- DAAK platform schema — plan.md section 3.
--
-- Design notes:
--  * shipments.status is never written directly by application code. Insert
--    a row into shipment_events instead; the trg_shipment_events_apply
--    trigger derives shipments.status/status_updated_at/picked_at/
--    delivered_at from it. This is the audit trail described in plan.md
--    section 4.3 ("status is never edited on the shipment row directly").
--  * A `riders` table is added even though plan.md section 3 doesn't spell
--    it out — shipments.pickup_rider_id and rider_runs.rider_id both need
--    something to reference, and plan.md section 1 names the riders
--    (WAL, SAL, ASFAR, SHB) as real entities.
--  * A `users` table is added for the same reason — plan.md section 2 lists
--    admin/ops/finance/CS roles and section 6 wants role-based access, but
--    section 3 never defines who's logging in. shipments.booked_by is a FK
--    to it rather than a free-text name.
--  * Money columns are NUMERIC, not FLOAT — this is a ledger.

BEGIN;

CREATE TYPE shipment_status AS ENUM (
    'BOOKED',
    'PICKUP_ASSIGNED',
    'PICKED',
    'HANDED_TO_CARRIER',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'RETURN_INITIATED',
    'RETURNED',
    'LOST',
    'DAMAGED',
    'CANCELLED'
);

CREATE TYPE event_source AS ENUM ('manual', 'carrier_api', 'rider_app', 'migration');

CREATE TYPE cod_direction AS ENUM ('carrier_in', 'sender_out');
CREATE TYPE cod_status AS ENUM ('pending', 'received', 'paid');

CREATE TYPE cod_payout_method AS ENUM ('bank', 'jazzcash', 'easypaisa', 'cash');

CREATE TYPE user_role AS ENUM ('admin', 'ops', 'finance', 'cs');

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           user_role NOT NULL,
    active         BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE cities (
    id                    SERIAL PRIMARY KEY,
    name                  TEXT NOT NULL,
    code                  TEXT NOT NULL,
    zone                  TEXT,
    serviceable_carriers  JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (code)
);

CREATE TABLE rate_cards (
    id                   SERIAL PRIMARY KEY,
    name                 TEXT NOT NULL,
    base_weight_kg       NUMERIC(6,3) NOT NULL DEFAULT 1,
    base_rate            NUMERIC(10,2) NOT NULL,
    per_kg_increment     NUMERIC(10,2) NOT NULL,
    cod_fee_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
    fuel_surcharge_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
    city_zone_overrides  JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
    id                 SERIAL PRIMARY KEY,
    name               TEXT NOT NULL,
    phone              TEXT,
    email              TEXT,
    cnic               TEXT,
    address            TEXT,
    rate_card_id       INTEGER REFERENCES rate_cards(id) ON DELETE SET NULL,
    cod_payout_method  cod_payout_method,
    bank_details       JSONB,
    credit_limit       NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_name ON customers (name);

CREATE TABLE carriers (
    id                SERIAL PRIMARY KEY,
    name              TEXT NOT NULL UNIQUE,
    api_credentials   TEXT,  -- store pgcrypto-encrypted payload, never plaintext
    active            BOOLEAN NOT NULL DEFAULT true,
    cities_served     JSONB NOT NULL DEFAULT '[]'::jsonb,
    cost_card         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE riders (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL,
    code           TEXT NOT NULL UNIQUE,  -- e.g. WAL, SAL, ASFAR, SHB
    phone          TEXT,
    password_hash  TEXT,  -- set on rider account creation; rider PWA logs in with phone+password
    active         BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shipments (
    id                  BIGSERIAL PRIMARY KEY,
    daak_tracking_no    TEXT NOT NULL UNIQUE
                        CHECK (daak_tracking_no ~ '^DAAK-\d{6}-\d{5,}$'),
    carrier_id          INTEGER REFERENCES carriers(id) ON DELETE RESTRICT,
    carrier_tracking_no TEXT,
    customer_id         INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    consignee_name      TEXT,
    consignee_phone     TEXT,
    consignee_address   TEXT,
    city_id             INTEGER REFERENCES cities(id) ON DELETE RESTRICT,
    weight_kg           NUMERIC(8,3),
    pieces              INTEGER NOT NULL DEFAULT 1,
    declared_value      NUMERIC(12,2),
    cod_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    dc_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
    carrier_cost        NUMERIC(12,2),
    profit              NUMERIC(12,2) GENERATED ALWAYS AS (dc_amount - carrier_cost) STORED,
    service_type        TEXT NOT NULL DEFAULT 'standard',
    status              shipment_status NOT NULL DEFAULT 'BOOKED',
    status_updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    booked_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    booked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    pickup_rider_id     INTEGER REFERENCES riders(id) ON DELETE SET NULL,
    picked_at           TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    return_reason       TEXT,
    attempts_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_shipments_customer_id ON shipments (customer_id);
CREATE INDEX idx_shipments_carrier_id ON shipments (carrier_id);
CREATE INDEX idx_shipments_city_id ON shipments (city_id);
CREATE INDEX idx_shipments_status ON shipments (status);
CREATE INDEX idx_shipments_booked_at ON shipments (booked_at);
-- carrier_tracking_no only needs to be unique per carrier, and is often absent
CREATE UNIQUE INDEX uq_shipments_carrier_tracking
    ON shipments (carrier_id, carrier_tracking_no)
    WHERE carrier_tracking_no IS NOT NULL;

CREATE TABLE shipment_events (
    id           BIGSERIAL PRIMARY KEY,
    shipment_id  BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    status       shipment_status NOT NULL,
    source       event_source NOT NULL DEFAULT 'manual',
    location     TEXT,
    note         TEXT,
    actor        TEXT,
    -- rider_app events: photo/signature data URIs, OTP verification, COD
    -- collected at delivery, confirmed weight/pieces at pickup, etc.
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipment_events_shipment_id ON shipment_events (shipment_id, created_at);
-- immutable audit trail: no update, no delete, ever
REVOKE UPDATE, DELETE ON shipment_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION trg_shipment_events_apply() RETURNS TRIGGER AS $$
BEGIN
    UPDATE shipments SET
        status = NEW.status,
        status_updated_at = NEW.created_at,
        picked_at = CASE WHEN NEW.status = 'PICKED' AND picked_at IS NULL
                         THEN NEW.created_at ELSE picked_at END,
        delivered_at = CASE WHEN NEW.status = 'DELIVERED' AND delivered_at IS NULL
                            THEN NEW.created_at ELSE delivered_at END,
        attempts_count = CASE WHEN NEW.status = 'OUT_FOR_DELIVERY'
                              THEN attempts_count + 1 ELSE attempts_count END
    WHERE id = NEW.shipment_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipment_events_apply
    AFTER INSERT ON shipment_events
    FOR EACH ROW EXECUTE FUNCTION trg_shipment_events_apply();

CREATE TABLE cod_ledger (
    id                  BIGSERIAL PRIMARY KEY,
    shipment_id         BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    direction           cod_direction NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    method              TEXT,
    reference_no        TEXT,
    reconciled_against  BIGINT REFERENCES cod_ledger(id) ON DELETE SET NULL,
    status              cod_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cod_ledger_shipment_id ON cod_ledger (shipment_id);
CREATE INDEX idx_cod_ledger_status ON cod_ledger (status);

CREATE TABLE rider_runs (
    id                BIGSERIAL PRIMARY KEY,
    rider_id          INTEGER NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
    run_date          DATE NOT NULL,
    pickups_count     INTEGER NOT NULL DEFAULT 0,
    payout_per_pickup NUMERIC(10,2) NOT NULL,
    total_payout      NUMERIC(12,2) GENERATED ALWAYS AS (pickups_count * payout_per_pickup) STORED,
    paid_at           TIMESTAMPTZ,
    UNIQUE (rider_id, run_date)
);

-- Maps each carrier's own status vocabulary to the locked shipment_status
-- enum (plan.md section 4.2). Kept as data, not code, so ops can add a
-- newly-observed carrier status string without a deploy.
CREATE TABLE carrier_status_map (
    id              SERIAL PRIMARY KEY,
    carrier_id      INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
    carrier_status  TEXT NOT NULL,
    mapped_status   shipment_status NOT NULL,
    UNIQUE (carrier_id, carrier_status)
);

CREATE TABLE carrier_invoices (
    id               BIGSERIAL PRIMARY KEY,
    carrier_id       INTEGER NOT NULL REFERENCES carriers(id) ON DELETE RESTRICT,
    invoice_no       TEXT NOT NULL,
    period           DATERANGE NOT NULL,
    claimed_amount   NUMERIC(12,2) NOT NULL,
    computed_amount  NUMERIC(12,2),
    variance         NUMERIC(12,2) GENERATED ALWAYS AS (claimed_amount - computed_amount) STORED,
    status           TEXT NOT NULL DEFAULT 'open',
    file_url         TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (carrier_id, invoice_no)
);

COMMIT;
