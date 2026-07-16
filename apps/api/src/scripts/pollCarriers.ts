import "dotenv/config";
import { applyCarrierStatusUpdate } from "../carriers/apply.js";
import { getCarrierAdapter, listCarriersWithAdapters } from "../carriers/registry.js";
import { pool } from "../db/pool.js";

// Intended to run on a schedule (plan.md section 4.2: "cron job every 30
// min polls carrier APIs"). No scheduler is wired up in this codebase yet —
// run this manually (`tsx src/scripts/pollCarriers.ts`) or point a real
// cron/Railway/Fly scheduled job at it once one exists.
const TERMINAL_STATUSES = ["DELIVERED", "RETURNED", "LOST", "DAMAGED", "CANCELLED"];

async function main() {
  const carrierNames = listCarriersWithAdapters();
  if (carrierNames.length === 0) {
    console.log("no carrier adapters registered — nothing to poll");
    return;
  }

  for (const carrierName of carrierNames) {
    const adapter = getCarrierAdapter(carrierName);
    if (!adapter?.pollStatus) continue;

    const carrier = await pool.query("SELECT id FROM carriers WHERE name = $1", [carrierName]);
    if (!carrier.rows[0]) {
      console.warn(`carrier ${carrierName} has an adapter but no carriers row — skipping`);
      continue;
    }
    const carrierId = carrier.rows[0].id as number;

    const shipments = await pool.query(
      `SELECT carrier_tracking_no FROM shipments
       WHERE carrier_id = $1 AND carrier_tracking_no IS NOT NULL AND status != ALL($2)`,
      [carrierId, TERMINAL_STATUSES]
    );

    console.log(`polling ${carrierName}: ${shipments.rows.length} in-flight shipment(s)`);
    for (const row of shipments.rows) {
      const updates = await adapter.pollStatus(row.carrier_tracking_no);
      for (const update of updates) {
        const result = await applyCarrierStatusUpdate(carrierId, update);
        console.log(`  ${row.carrier_tracking_no}:`, result);
      }
    }
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
