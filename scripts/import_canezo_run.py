#!/usr/bin/env python3
"""
One-shot import of the Canezo delivery run from the Google Sheet
(gid=1579495998 — 31 shipments across Islamabad/Rawalpindi and Lahore).

Usage:
    DATABASE_URL="postgresql://..." python3 scripts/import_canezo_run.py

Safe to re-run — existing shipments matched by canezo_order_no (stored in
the booking event note) are skipped.  PostEx shipments are also skipped if
a matching carrier_tracking_no already exists for that carrier.
"""

import os, sys
import psycopg2
from datetime import date

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL env var is required", file=sys.stderr)
    sys.exit(1)

# ── Shipment data from the sheet ──────────────────────────────────────────────
# Fields: (canezo_order_no, date, consignee_name, phone, address,
#          items, cod_amount, dc_amount, status_raw, carrier_tracking, city_key)
#
# status_raw mapping:
#   "Delivered" → DELIVERED
#   "Cancelled" → CANCELLED
#   "Pending"   → BOOKED
#   ""          → HANDED_TO_CARRIER  (has PostEx tracking, older orders)
#   "" no track → BOOKED             (no tracking, no explicit status)
#
# city_key: "ISB" | "RWP" | "LHR"

SHIPMENTS = [
    # ── Islamabad / Rawalpindi ─────────────────────────────────────────────
    (2005, "2026-07-31", "Shehzad Ansari",           "03008266228",
     "15-A, Street 33, F-6/1, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Pending",    None,                 "ISB"),

    (2010, "2026-07-31", "Dr. Syed Aoun Sajid Naqvi","03335142161",
     "A-35, Satellite Town, Sadiq Abad Road, Rawalpindi",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Delivered",  None,                 "RWP"),

    (2011, "2026-07-31", "Umar Bashir",               "03315565651",
     "Hyaat International Hospital, Plot 4B, G13-1, Islamabad",
     "Desi Gurr Bites 500g x2",                       2400, 350, "Pending",    None,                 "ISB"),

    (2012, "2026-08-01", "Iftikhar Mustafa",          "03009556283",
     "H# 95 St# 96 Sector I-8/4, Islamabad",
     "Desi Shakkar 500g x1",                          1350, 350, "Pending",    None,                 "ISB"),

    (2013, "2026-08-01", "Miss Bushra",               "03455885562",
     "House 42, St 4, Bahria Town Phase 1, Rawalpindi",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Pending",    None,                 "RWP"),

    (1999, "2026-07-31", "Awais Sardar",              "03365383006",
     "House No 139-A, St 7, F-17, Islamabad Tarnol, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Pending",    None,                 "ISB"),

    (2032, "2026-08-03", "Naveed Yusuf",              "03008500850",
     "F-10/4, House 50, Street 187, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Delivered",  "26229270000961",     "ISB"),

    (2037, "2026-08-03", "Neelum Neelum",             "03226776588",
     "9/5C Askari Towers 2, DHA Phase 2, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Cancelled",  "29229270000960",     "ISB"),

    (2038, "2026-08-03", "Iftikhar Kiani",            "03345552288",
     "House 15, Sector B, Street 4, DHA 1, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "Cancelled",  "20229270000959",     "ISB"),

    (1897, "2026-07-22", "Usman Asif Shahzada",       "03005552074",
     "Apt 106, Silver Oaks Apartments, F-10/4, Near F-10 Markaz, Islamabad",
     "Desi Duo x1",                                   2300, 350, "",           "20229270000844",     "ISB"),

    (1899, "2026-07-23", "Arslan Iqbal",              "03238328101",
     "1066, Arbaz Street, Bakir Colony, Tulsa Road, Rawalpindi",
     "Desi Shakkar 500g x4 (custom discount -Rs.1800)",2700, 350, "",           "21229270000842",    "RWP"),

    (1922, "2026-07-26", "Daud Shah",                 "03713288025",
     "Daud Brothers Construction, Opp. Juniper Residencia, Upper Bani Gala, Islamabad",
     "Desi Duo x1",                                   2300, 350, "",           "27229270000867",     "ISB"),

    (1923, "2026-07-26", "Rumman Ahmed",              "03176837317",
     "Street 19, House 3, Fazaia Colony, Khanna Pul, Rawalpindi",
     "Desi Duo x1",                                   2300, 350, "",           "24229270000866",     "RWP"),

    (1935, "2026-07-27", "Shagufta Naheed",           "03225555220",
     "G13/2, Street 68, House 7, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "20229270000855",     "ISB"),

    (1941, "2026-07-27", "Amna Fasih",                "03412158942",
     "House 259, Street 53, F-10/4, Islamabad",
     "Desi Duo x1",                                   2300, 350, "",           "29229270000895",     "ISB"),

    (1948, "2026-07-28", "Muhammad Umar Khan",        "03335447208",
     "House 957, Street 10, Block C, National Police Foundation, Sector O-9, Islamabad",
     "Desi Duo x1",                                   2300, 350, "",           "25229270000888",     "ISB"),

    (1952, "2026-07-28", "Zara Gul",                  "03315094545",
     "House 20, Street 48, Sector G6 1-1, Near Regalia Hotel Main Gate, Islamabad",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "22229270000884",     "ISB"),

    # ── Lahore ────────────────────────────────────────────────────────────
    (2004, "2026-07-31", "Nadeem Khan",               "03217996040",
     "389B-D Block, Faisal Town, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           None,                 "LHR"),

    (2009, "2026-07-31", "Mrs. Haroon H",             "03008460838",
     "House#15 Block A, Street 1, Faisal Town, Lahore",
     "Desi Gurr Bites 500g x1 + Desi Shakkar 500g x1",2400, 350, "",           None,                "LHR"),

    (2016, "2026-08-01", "Shavana Saleem",            "03152168786",
     "562/SD House, Falicon Society, Kalma Chowk Street 33, Lahore",
     "Desi Duo (Shakkar & Gurr Bites) x1",            2300, 350, "",           None,                 "LHR"),

    (2018, "2026-08-01", "Syed M Shah",               "03234030007",
     "29-Tufail Road, Wireless Compound Cantt, Mall of Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           None,                 "LHR"),

    (2022, "2026-08-01", "Memoona Afridi",            "03018238640",
     "MCB Center, 4th Floor, Opposite Askari 10, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           None,                 "LHR"),

    (2023, "2026-08-01", "Dr. Adnan Maqbool",         "03009629512",
     "39/1 Z Block, DHA Phase 3, Lahore",
     "Desi Duo (Shakkar & Gurr Bites) x1",            2300, 350, "",           None,                 "LHR"),

    (1925, "2026-07-26", "Assad Ali",                 "03218481300",
     "IH 314 Falcon Complex, Gulberg, Lahore",
     "Desi Shakkar 500g x1",                          1350, 350, "",           "29229270000864",     "LHR"),

    (1896, "2026-07-22", "Dr. Mansoor Haq",           "03219468768",
     "H.No 363, Street 11, Sector E, Askari 10, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "24229270000845",     "LHR"),

    (1919, "2026-07-26", "Tanveer Nishan",            "03233333233",
     "House 19, Babar Block, New Garden Town, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "24229270000870",     "LHR"),

    (1920, "2026-07-26", "Irfan Qureshi",             "03009641360",
     "House 70, Street 13, Cavalry Ground, Lahore",
     "Desi Duo x1",                                   2300, 350, "",           "20229270000869",     "LHR"),

    (1929, "2026-07-27", "Rehan Shuja",               "03334535475",
     "House 143, Block A, New Chuburji Park, Opp. Khujoor Wali Masjid, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "26229270000860",     "LHR"),

    (1930, "2026-07-27", "Hasham Majeed",             "03228426047",
     "House 144, Block E2, Upper Portion, Johar Town, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "26229270000859",     "LHR"),

    (1933, "2026-07-27", "Meesam Mirza",              "03338808635",
     "Imamia Colony, Usmania Street, Ideal Villa, Shahdara, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "29229270000857",     "LHR"),

    (1954, "2026-07-28", "Daniyal Faheem",            "03224020983",
     "584/117 Overseas B Extension, Bahria Town, Lahore",
     "Desi Gurr Bites 500g x1",                       1350, 350, "",           "20229270000883",     "LHR"),
]

STATUS_MAP = {
    "Delivered": "DELIVERED",
    "Cancelled": "CANCELLED",
    "Pending":   "BOOKED",
    "":          None,  # resolved below based on whether tracking exists
}

def resolve_status(status_raw, carrier_tracking):
    s = STATUS_MAP.get(status_raw)
    if s is not None:
        return s
    # empty status: if has tracking → handed to carrier, else just booked
    return "HANDED_TO_CARRIER" if carrier_tracking else "BOOKED"

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # ── Look up reference IDs ──────────────────────────────────────────────
    cur.execute("SELECT id FROM customers WHERE name = 'CANEZO' LIMIT 1")
    row = cur.fetchone()
    if not row:
        print("ERROR: CANEZO customer not found — run setupCanezo.ts first", file=sys.stderr)
        sys.exit(1)
    canezo_id = row[0]
    print(f"CANEZO customer id = {canezo_id}")

    city_ids = {}
    for key, name in [("ISB", "Islamabad"), ("RWP", "Rawalpindi"), ("LHR", "Lahore")]:
        cur.execute("SELECT id FROM cities WHERE name ILIKE %s LIMIT 1", (name,))
        row = cur.fetchone()
        if not row:
            print(f"WARNING: city '{name}' not found — city_id will be NULL for {key} orders")
            city_ids[key] = None
        else:
            city_ids[key] = row[0]
            print(f"City {name} id = {row[0]}")

    # PostEx carrier (optional — ok if absent)
    cur.execute("SELECT id FROM carriers WHERE name ILIKE %s LIMIT 1", ("PostEx",))
    row = cur.fetchone()
    postex_id = row[0] if row else None
    if postex_id:
        print(f"PostEx carrier id = {postex_id}")
    else:
        print("WARNING: PostEx carrier not found — carrier_id will be NULL, tracking stored as note")

    # ── Import each shipment ───────────────────────────────────────────────
    inserted = skipped = 0

    for (order_no, dt_str, name, phone, address, items,
         cod, dc, status_raw, tracking, city_key) in SHIPMENTS:

        status = resolve_status(status_raw, tracking)
        city_id = city_ids.get(city_key)
        carrier_id = postex_id if tracking else None
        booked_at = f"{dt_str} 12:00:00+05"

        # Skip if already imported (note contains the Canezo order number)
        cur.execute("""
            SELECT s.id FROM shipments s
            JOIN shipment_events e ON e.shipment_id = s.id
            WHERE s.customer_id = %s
              AND e.note LIKE %s
            LIMIT 1
        """, (canezo_id, f"%Canezo order #{order_no}%"))
        if cur.fetchone():
            print(f"  SKIP  order #{order_no} — already imported")
            skipped += 1
            continue

        # Also skip if PostEx tracking already exists
        if tracking and carrier_id:
            cur.execute("""
                SELECT id FROM shipments
                WHERE carrier_id = %s AND carrier_tracking_no = %s
                LIMIT 1
            """, (carrier_id, tracking))
            if cur.fetchone():
                print(f"  SKIP  order #{order_no} — PostEx tracking {tracking} already in DB")
                skipped += 1
                continue

        # Generate DAAK tracking number
        cur.execute("SELECT nextval(pg_get_serial_sequence('shipments', 'id'))")
        new_id = cur.fetchone()[0]
        daak_no = f"DAAK-{dt_str.replace('-', '')[2:]}-{str(new_id).zfill(5)}"

        cur.execute("""
            INSERT INTO shipments (
                id, daak_tracking_no, customer_id, carrier_id, carrier_tracking_no,
                consignee_name, consignee_phone, consignee_address,
                city_id, cod_amount, dc_amount, status, booked_at, status_updated_at
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s, %s, %s
            )
        """, (
            new_id, daak_no, canezo_id, carrier_id, tracking,
            name, phone, address,
            city_id, cod, dc, status, booked_at, booked_at,
        ))

        note = f"Canezo order #{order_no} | {items}"
        if tracking:
            note += f" | PostEx {tracking}"

        cur.execute("""
            INSERT INTO shipment_events (shipment_id, status, source, actor, note, created_at)
            VALUES (%s, %s, 'migration', 'import_canezo_run.py', %s, %s)
        """, (new_id, status, note, booked_at))

        # For DELIVERED, also add a delivered event
        if status == "DELIVERED":
            cur.execute("""
                INSERT INTO shipment_events (shipment_id, status, source, actor, note, created_at)
                VALUES (%s, 'DELIVERED', 'migration', 'import_canezo_run.py', 'Delivered — imported from Canezo run sheet', %s)
            """, (new_id, booked_at))

        print(f"  OK    order #{order_no} → {daak_no} ({status}) — {name}")
        inserted += 1

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nDone. Inserted: {inserted}  Skipped: {skipped}")

if __name__ == "__main__":
    main()
