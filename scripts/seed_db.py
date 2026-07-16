#!/usr/bin/env python3
"""Load the normalized CSVs from scripts/migrate.py into the Postgres schema.

Expects db/schema.sql to have already been applied to the target database.
Loads in FK order: cities, riders (static), customers, carriers (derived
from shipments.csv), shipments, shipment_events. Each table's SERIAL/
BIGSERIAL sequence is reset to max(id) afterward so future application
inserts don't collide with the historical ids preserved from migration.

Usage:
    python3 scripts/seed_db.py --dsn postgresql://user:pass@host/daak
    (or set DATABASE_URL)
"""
from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path

import psycopg2
import psycopg2.extras

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INDIR = REPO_ROOT / "data" / "processed"

# The riders named in plan.md section 1. Not produced by migrate.py (Phase 0
# scope is customers/shipments/shipment_events/cities only) but shipments.csv
# references them by code, so they must exist before shipments are loaded.
KNOWN_RIDERS = [
    {"name": "WAL", "code": "WAL"},
    {"name": "SAL", "code": "SAL"},
    {"name": "ASFAR", "code": "ASFAR"},
    {"name": "SHB", "code": "SHB"},
]


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def none_if_blank(v):
    return v if v not in (None, "") else None


def reset_sequence(cur, table: str, id_col: str = "id"):
    cur.execute(
        f"SELECT setval(pg_get_serial_sequence(%s, %s), "
        f"COALESCE((SELECT MAX({id_col}) FROM {table}), 1), "
        f"(SELECT MAX({id_col}) FROM {table}) IS NOT NULL)",
        (table, id_col),
    )


def load_cities(cur, indir: Path):
    rows = read_csv(indir / "cities.csv")
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO cities (id, name, code, zone) VALUES %s",
        [(r["id"], r["name"], r["code"], none_if_blank(r["zone"])) for r in rows],
    )
    reset_sequence(cur, "cities")
    print(f"  cities: {len(rows)}")


def load_riders(cur) -> dict[str, int]:
    result = psycopg2.extras.execute_values(
        cur,
        "INSERT INTO riders (name, code) VALUES %s RETURNING id, code",
        [(r["name"], r["code"]) for r in KNOWN_RIDERS],
        fetch=True,
    )
    code_to_id = {code: rid for rid, code in result}
    reset_sequence(cur, "riders")
    print(f"  riders: {len(KNOWN_RIDERS)}")
    return code_to_id


def load_customers(cur, indir: Path):
    rows = read_csv(indir / "customers.csv")
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO customers (id, name, phone, email, cnic, address, cod_payout_method, credit_limit) "
        "VALUES %s",
        [(
            r["id"], r["name"], none_if_blank(r["phone"]), none_if_blank(r["email"]),
            none_if_blank(r["cnic"]), none_if_blank(r["address"]),
            none_if_blank(r["cod_payout_method"]), r["credit_limit"] or 0,
        ) for r in rows],
    )
    reset_sequence(cur, "customers")
    print(f"  customers: {len(rows)}")


def load_carriers(cur, shipment_rows: list[dict]) -> dict[str, int]:
    codes = sorted({r["carrier_code"] for r in shipment_rows if r["carrier_code"]})
    result = psycopg2.extras.execute_values(
        cur,
        "INSERT INTO carriers (name) VALUES %s RETURNING id, name",
        [(code,) for code in codes],
        fetch=True,
    )
    code_to_id = {name: cid for cid, name in result}
    reset_sequence(cur, "carriers")
    print(f"  carriers: {len(codes)} ({', '.join(codes)})")
    return code_to_id


def load_shipments(cur, indir: Path, carrier_map: dict[str, int], rider_map: dict[str, int]) -> set[str]:
    rows = read_csv(indir / "shipments.csv")
    values = []
    skipped = []
    for r in rows:
        if not r["booked_at"]:
            # already surfaced in data_quality_report.csv (unparseable source date);
            # booked_at is NOT NULL, so this row needs a human-supplied date before
            # it can be seeded rather than being loaded with a fabricated one.
            skipped.append(r)
            continue
        status = r["status"] or "BOOKED"
        values.append((
            r["id"], r["daak_tracking_no"], carrier_map[r["carrier_code"]],
            none_if_blank(r["carrier_tracking_no"]), r["customer_id"],
            none_if_blank(r["consignee_name"]), none_if_blank(r["city_id"]),
            none_if_blank(r["weight_kg"]), r["pieces"] or 1,
            none_if_blank(r["declared_value"]), r["cod_amount"] or 0, r["dc_amount"] or 0,
            none_if_blank(r["carrier_cost"]), status, r["booked_at"],
            rider_map.get(r["rider_code"]) if r["rider_code"] else None,
        ))
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO shipments (id, daak_tracking_no, carrier_id, carrier_tracking_no, customer_id, "
        "consignee_name, city_id, weight_kg, pieces, declared_value, cod_amount, dc_amount, "
        "carrier_cost, status, booked_at, pickup_rider_id) VALUES %s",
        values,
    )
    reset_sequence(cur, "shipments")
    print(f"  shipments: {len(values)}")
    if skipped:
        print(f"  shipments SKIPPED (missing booked_at, needs manual fix): {len(skipped)}")
        for r in skipped:
            print(f"    id={r['id']} {r['source_sheet']} row {r['source_row']}")
    return {v[0] for v in values}


def load_shipment_events(cur, indir: Path, valid_shipment_ids: set[str]):
    rows = read_csv(indir / "shipment_events.csv")
    rows = [r for r in rows if r["shipment_id"] in valid_shipment_ids]
    # ascending id order matters: BOOKED must apply before the terminal-status
    # event for the same shipment, since the shipments trigger derives
    # current status from whichever event was inserted most recently.
    rows.sort(key=lambda r: int(r["id"]))
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO shipment_events (id, shipment_id, status, source, location, note, actor, created_at) "
        "VALUES %s",
        [(
            r["id"], r["shipment_id"], r["status"], r["source"],
            none_if_blank(r["location"]), none_if_blank(r["note"]),
            none_if_blank(r["actor"]), r["created_at"] or None,
        ) for r in rows],
    )
    reset_sequence(cur, "shipment_events")
    print(f"  shipment_events: {len(rows)}")


def run(dsn: str, indir: Path):
    conn = psycopg2.connect(dsn)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM shipments")
                if cur.fetchone()[0] > 0:
                    raise SystemExit(
                        "shipments table is not empty — refusing to seed on top of existing data. "
                        "Re-create the database from db/schema.sql first."
                    )

                print("Seeding...")
                load_cities(cur, indir)
                rider_map = load_riders(cur)
                load_customers(cur, indir)

                shipment_rows = read_csv(indir / "shipments.csv")
                carrier_map = load_carriers(cur, shipment_rows)

                valid_shipment_ids = load_shipments(cur, indir, carrier_map, rider_map)
                load_shipment_events(cur, indir, valid_shipment_ids)
    finally:
        conn.close()
    print("Done.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dsn", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--indir", type=Path, default=DEFAULT_INDIR)
    args = parser.parse_args()

    if not args.dsn:
        raise SystemExit("no database DSN: pass --dsn or set DATABASE_URL")
    if not (args.indir / "shipments.csv").exists():
        raise SystemExit(f"no shipments.csv in {args.indir} — run scripts/migrate.py first")

    run(args.dsn, args.indir)


if __name__ == "__main__":
    main()
