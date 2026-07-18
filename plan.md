# DAAK Courier — Digitization & ERP Build Plan

Build plan for Claude Code. Goal: take Daak from Excel sheets to a full digital courier operation with FedEx-level SOPs, live tracking, COD reconciliation, and multi-carrier management.

---

## 1. What the data tells us (baseline reality)

Source: CUSTOMER_PARCELS_DETAIL.xlsx — 8 sheets, ~6,700 shipments (Oct 2022 onward).

**Business model discovered:**
- Daak is a courier **aggregator + last-mile operator**. It books shipments through partner carriers (BlueEx ~4,858 parcels, Call Courier ~150, Rocket ~1,170, Courier Next, Leopard, DoDeliver) and Karachi agents (Arif Bhai, Hassan).
- Revenue = DC (delivery charge billed to customer) minus carrier cost. BlueEx sheet tracks per-parcel carrier cost and profit.
- 62% of parcels are COD. ~PKR 27.6M in COD value handled through BlueEx alone. Daak collects from carrier, deducts DC, remits balance to sender.
- Riders (WAL, SAL, ASFAR, SHB) do pickups, paid PKR 100–150 per pickup.
- Outcomes: ~93% delivered, ~6.3% returned, 16 lost.
- Repeat senders dominate: top 10 customers = majority of volume (PAPOSH 1,431 parcels, AK COLLECTION 627, SMART 323...). These are small e-commerce sellers.

**Data problems the new system must eliminate:**
- Mixed date formats (Excel serials like 44631 next to dd/mm/yyyy strings)
- Broken serial numbers (fractional row numbers from drag-fill)
- Missing tracking numbers (74 in BlueEx sheet alone)
- Status/paid/rider columns polluted with free text ("clear", "OK", "P", "p", "`")
- One sheet per carrier = no unified view, no customer ledger, no reconciliation trail
- Zero visibility for the sender: no portal, no tracking page, no automated notifications

---

## 2. Product scope — four apps, one database

```
┌─────────────────────────────────────────────────────┐
│                  DAAK PLATFORM                       │
├──────────────┬──────────────┬───────────┬───────────┤
│ Admin ERP    │ Rider PWA    │ Customer  │ Public    │
│ (ops team)   │ (pickup/     │ Portal    │ Tracking  │
│              │  delivery)   │ (senders) │ Page      │
└──────────────┴──────────────┴───────────┴───────────┘
                       │
              PostgreSQL (single source of truth)
                       │
        Carrier APIs: BlueEx · Leopard · Call Courier ·
        Trax · PostEx (booking + status webhooks)
```

### App 1 — Admin ERP (web, desktop-first)
- Booking desk: create shipment, auto-assign carrier by city/rate, print label + CN
- Shipment board: filter by status, carrier, customer, city, date
- COD ledger: carrier remittances in → sender payouts out, per-shipment matching
- Customer accounts: rate cards, credit terms, statement generation
- Rider management: pickup runs, per-pickup payout tally
- Carrier reconciliation: invoice vs booked cost, dispute queue
- Reports: daily ops, P&L per customer/carrier/city, return-rate alerts
- User roles: admin, ops, finance, CS (read-only + ticket actions)

### App 2 — Rider PWA (mobile-first)
- Assigned pickup list with map link and customer phone
- Scan/enter tracking number at pickup, capture parcel count + weight
- Photo proof of pickup, digital signature
- Delivery mode (for Daak's own last-mile parcels): POD photo, OTP confirmation, COD collection entry
- Offline-first: queue actions, sync on reconnect
- Daily earnings tally visible to rider

### App 3 — Customer Portal (senders)
- Self-service booking: single + bulk CSV upload
- Live status of all their shipments
- COD wallet: pending, cleared, paid-out amounts with statement download
- Return notifications with reason and re-attempt request button
- Rate calculator by city and weight

### App 4 — Public Tracking Page
- track.daak.pk/{tracking_number} — no login
- Timeline view: Booked → Picked → In Transit → Out for Delivery → Delivered / Returned
- Pulls Daak status + carrier API status, shows the freshest
- WhatsApp/SMS deep link on every status change

---

## 3. Data model (PostgreSQL)

```sql
customers      id, name, phone, email, cnic, address, rate_card_id,
               cod_payout_method (bank/jazzcash/cash), bank_details,
               credit_limit, created_at

rate_cards     id, name, base_weight_kg, base_rate, per_kg_increment,
               cod_fee_pct, fuel_surcharge_pct, city_zone_overrides (jsonb)

carriers       id, name (bluex/leopard/callcourier/trax/postex/self),
               api_credentials (encrypted), active, cities_served (jsonb),
               cost_card (jsonb)

shipments      id, daak_tracking_no (DAAK-YYMMDD-XXXXX, generated),
               carrier_id, carrier_tracking_no,
               customer_id, consignee_name, consignee_phone,
               consignee_address, city_id, weight_kg, pieces,
               declared_value, cod_amount, dc_amount, carrier_cost,
               profit (generated), service_type (overnight/standard),
               status, status_updated_at, booked_by, booked_at,
               pickup_rider_id, picked_at, delivered_at,
               return_reason, attempts_count

shipment_events  id, shipment_id, status, source (manual/carrier_api/
                 rider_app), location, note, actor, created_at
                 -- immutable audit trail, never update, only insert

cod_ledger     id, shipment_id, direction (carrier_in/sender_out),
               amount, method, reference_no, reconciled_against,
               status (pending/received/paid), created_at

rider_runs     id, rider_id, run_date, pickups_count, payout_per_pickup,
               total_payout, paid_at

carrier_invoices  id, carrier_id, invoice_no, period, claimed_amount,
                  computed_amount, variance, status, file_url

cities         id, name, code, zone, serviceable_carriers (jsonb)
```

**Status enum (locked, no free text ever again):**
`BOOKED → PICKUP_ASSIGNED → PICKED → HANDED_TO_CARRIER → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED | RETURN_INITIATED → RETURNED | LOST | DAMAGED | CANCELLED`

---

## 4. Tracking system design

1. **Dual tracking numbers.** Every parcel gets a Daak number at booking, before any carrier is chosen. Carrier number attaches later. Customer only ever needs the Daak number.
2. **Carrier status ingestion.** Cron job every 30 min polls carrier APIs (BlueEx, Leopard, Trax, PostEx all have REST APIs; Call Courier has one too). Webhooks where supported. Map each carrier's status vocabulary to the Daak enum via a translation table.
3. **Event sourcing.** Status is never edited on the shipment row directly — a new `shipment_events` row is inserted and the shipment's current status is derived. This is the audit trail that makes disputes winnable.
4. **Notifications.** On status change: WhatsApp Business API message (primary in Pakistan), SMS fallback, portal update. Templates per status, Urdu + English.
5. **Exception queue.** Any shipment with no status change in 48h, 2+ failed attempts, or carrier-reported hold lands in an ops exception dashboard with an SLA timer.

---

## 5. FedEx-level SOPs (the operating system, not just software)

FedEx's edge is not software alone — it is that every parcel movement has one owner, one scan, and one clock. Codify these:

### SOP-01 Booking & acceptance
- No parcel enters the system without: consignee phone verified format, weight recorded on calibrated scale, contents declared, prohibited-items checklist signed off.
- Label printed at booking. No handwritten CNs.
- COD amount confirmed with sender via portal or recorded call before dispatch.

### SOP-02 Pickup
- Rider must scan every parcel at pickup. Unscanned = not picked, no exceptions.
- Photo of parcel stack + sender signature in app.
- Pickup cutoff time published per zone (e.g., booked by 4pm = picked same day).

### SOP-03 Carrier handover
- Handover manifest generated per carrier per day. Carrier rep signs digitally or on paper (scanned in). Discrepancy at handover raises an immediate exception, not a note in a spreadsheet.

### SOP-04 In-transit monitoring
- 48-hour no-movement rule: auto-flag, ops must contact carrier within 4 working hours and log the response.
- Lost declaration only after documented 3-touch escalation; triggers claim workflow against carrier and compensation workflow toward sender per published policy.

### SOP-05 Delivery & returns
- Delivery requires POD from carrier API or rider (photo/OTP for own deliveries).
- Failed attempt requires a reason code from a fixed list. 2 failed attempts → CS calls consignee same day. 3 → return initiated automatically, sender notified with reason.
- Returned parcels physically verified against manifest within 24h of arrival; sender notified for collection/redelivery decision.

### SOP-06 COD handling (highest-risk area)
- Carrier COD remittance reconciled shipment-by-shipment within 24h of receipt — never lump-sum accepted.
- Sender payouts on a fixed published cycle (e.g., Mon/Thu), only for `DELIVERED + carrier_in received` parcels.
- Any COD variance > PKR 0 goes to a dispute queue with owner and deadline.
- Segregate COD float from operating cash. Daily COD position report to owner.

### SOP-07 Claims & liability
- Published liability policy: declared value coverage, claim window (e.g., 7 days from delivery/loss declaration), evidence required.
- Every lost/damaged parcel = a claim record with status, not a WhatsApp conversation.

### SOP-08 Data discipline
- No Excel side-ledgers. If it happened, it is in the system.
- Locked dropdowns everywhere free text caused chaos before (status, city, rider, paid).
- Daily automated backup, monthly restore test.

### KPIs on the admin dashboard (FedEx manages by these)
- On-time delivery % (by carrier, by city)
- First-attempt delivery success %
- Return rate % (current baseline: 6.3% — target < 4%)
- Lost rate (baseline: 16 / 6,700 ≈ 0.24% — target < 0.05%)
- COD remittance cycle time (carrier→Daak, Daak→sender)
- Profit per parcel by carrier and customer
- Exception queue age (nothing older than 48h)

---

## 6. Tech stack (aligned with existing Assorted Group patterns)

- **Backend:** Node.js (Express or NestJS) + PostgreSQL (Neon or Supabase for managed hosting)
- **Admin ERP + Customer Portal:** React (Vite), Tailwind, single deployable each
- **Rider app:** PWA, mobile-first, offline queue via IndexedDB + background sync (same pattern as the APT Rider PWA, but backed by Postgres/API instead of Sheets — Sheets will not survive courier volume or concurrency)
- **Public tracking:** static-friendly React page, aggressive caching
- **Hosting:** Vercel (frontends) or Netlify per current workflow; API on Railway/Render/Fly; domain under a daak subdomain or its own domain
- **Notifications:** WhatsApp Business Cloud API + local SMS gateway (Telenor/Jazz business SMS or a reseller like Veevo/BulkSMS PK)
- **Label printing:** browser print CSS for 4x6 thermal labels, barcode via JsBarcode
- **Auth:** email/phone OTP; role-based access

---

## 7. Build phases for Claude Code

### Phase 0 — Data migration (week 1)
- Write a Python cleaner for CUSTOMER_PARCELS_DETAIL.xlsx:
  - Normalize dates (detect Excel serials vs dd/mm/yyyy)
  - Normalize status ("deliver"→DELIVERED, "return"→RETURNED, "lost"→LOST)
  - Deduplicate customers (PAPOSH AUNTY / PAPOSH = one entity)
  - Map city free text to a canonical city table
  - Flag rows with missing tracking numbers for manual review
- Import into Postgres. Historical data becomes the seed for customer accounts and analytics.

### Phase 1 — Core ERP MVP (weeks 2–4)
- DB schema + API
- Booking desk with label printing
- Shipment list + manual status updates + event log
- Customer master + rate cards
- Public tracking page
- Replace the Excel entry sheets entirely — this is the go/no-go milestone

### Phase 2 — COD & money (weeks 5–6)
- COD ledger, carrier remittance entry + per-shipment matching
- Sender payout batches with statements
- Rider run payouts
- Profit-per-parcel reporting

### Phase 3 — Carrier API integration (weeks 7–9)
- BlueEx first (biggest volume), then Trax/PostEx/Leopard
- Auto-booking: create CN via API from booking desk
- Status polling + webhook ingestion + status translation table
- Carrier invoice reconciliation screen

### Phase 4 — Rider PWA + Customer Portal (weeks 10–13)
- Rider pickup flow with scan, photo, signature, offline sync
- Customer portal with bulk upload and COD wallet
- WhatsApp/SMS notification engine

### Phase 5 — Hardening (ongoing)
- Exception queue + SLA timers
- KPI dashboard
- Claims module
- Automated backups + restore drills
- SOP documents published in-app per role

---

## 8. Business ideas to make Daak stand out

1. **Same-day COD payout tier** (premium fee) — biggest pain point for small sellers; the data shows Daak's customers are exactly these sellers.
2. **Multi-carrier smart routing** — auto-pick cheapest/most reliable carrier per city using Daak's own historical delivery-success data per carrier per city. This is a genuine moat: Daak already has 6,700 shipments of carrier performance data.
3. **Seller dashboard as the product** — small sellers using WhatsApp to run shops get inventory-of-shipments, return analytics, and COD cash flow visibility for free. Stickiness beats price wars.
4. **Return-reduction service** — pre-delivery WhatsApp confirmation to consignee cuts returns (each return is double freight cost). Target the 6.3% return rate directly.
5. **Franchise/agent model** — the Arif Bhai / Hassan Karachi agent sheets show this already exists informally. Formalize with agent logins, commission tracking, and agent-level P&L.
6. **API for sellers** — Shopify/WooCommerce plugin so orders flow straight into Daak booking. (HandPicked.pk can be the first pilot merchant.)

---

## 9. Claude Code kickoff prompt

When starting the build, begin with:

```
Read plan.md. Start with Phase 0: write scripts/migrate.py that
cleans CUSTOMER_PARCELS_DETAIL.xlsx per section 7 Phase 0, outputs
normalized CSVs (customers, shipments, shipment_events, cities),
and a data-quality report of rows needing manual review. Then
scaffold the Postgres schema from section 3 with a seed script.
```

Work one phase at a time. Do not start Phase N+1 until the go/no-go milestone of Phase N is met in production use.
