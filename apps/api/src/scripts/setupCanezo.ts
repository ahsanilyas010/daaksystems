import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

// One-shot setup script for Canezo onboarding:
//   - Upserts Canezo as a customer with customer-portal login
//   - Upserts admin/ops/finance/cs user accounts for the DAAK team
//
// Usage:
//   DATABASE_URL=<production_url> \
//   CANEZO_PASSWORD=<portal_password> \
//   ADMIN_PASSWORD=<admin_erp_password> \
//   tsx src/scripts/setupCanezo.ts
//
// Safe to re-run — all statements use INSERT … ON CONFLICT / UPDATE by name.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env var ${name} is required`);
  return v;
}

async function main() {
  const canezoPassword = requireEnv("CANEZO_PASSWORD");
  const adminPassword  = requireEnv("ADMIN_PASSWORD");

  console.log("Setting up Canezo on DAAK platform...\n");

  // ── Customer portal login ──────────────────────────────────────────────────
  const custHash = await bcrypt.hash(canezoPassword, 10);
  const existing = await pool.query("SELECT id FROM customers WHERE name = 'CANEZO'");
  let custRows;
  if (existing.rows.length > 0) {
    ({ rows: custRows } = await pool.query(
      "UPDATE customers SET email = $1, password_hash = $2 WHERE name = 'CANEZO' RETURNING id, name, email",
      ["canezo@daak.pk", custHash],
    ));
  } else {
    ({ rows: custRows } = await pool.query(
      `INSERT INTO customers (name, email, password_hash, cod_payout_method, credit_limit)
       VALUES ('CANEZO', 'canezo@daak.pk', $1, NULL, 0) RETURNING id, name, email`,
      [custHash],
    ));
  }
  console.log("Customer portal:", custRows[0]);

  // ── Admin ERP user accounts ────────────────────────────────────────────────
  const users = [
    { name: "Ahsan Ilyas", email: "admin@daak.pk",   role: "admin",   pw: adminPassword },
    { name: "Ops Team",    email: "ops@daak.pk",     role: "ops",     pw: adminPassword },
    { name: "Finance",     email: "finance@daak.pk", role: "finance", pw: adminPassword },
    { name: "CS Team",     email: "cs@daak.pk",      role: "cs",      pw: adminPassword },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.pw, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
       RETURNING id, name, email, role`,
      [u.name, u.email, hash, u.role],
    );
    console.log("User:", rows[0]);
  }

  await pool.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
