import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

// Usage: tsx src/scripts/setRiderPassword.ts <rider_code> <phone> <password>
// Sets login credentials on an existing riders row (seeded by scripts/seed_db.py).
async function main() {
  const [riderCode, phone, password] = process.argv.slice(2);
  if (!riderCode || !phone || !password) {
    console.error("Usage: tsx src/scripts/setRiderPassword.ts <rider_code> <phone> <password>");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    "UPDATE riders SET phone = $1, password_hash = $2 WHERE code = $3 RETURNING id, name, code, phone",
    [phone, hash, riderCode]
  );
  if (!rows[0]) {
    console.error(`no rider found with code ${riderCode}`);
    process.exit(1);
  }
  console.log("rider login set:", rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
