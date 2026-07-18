import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

// Usage: tsx src/scripts/setCustomerPassword.ts <customer_name_exact> <email> <password>
// Sets portal login credentials on an existing customers row.
async function main() {
  const [customerName, email, password] = process.argv.slice(2);
  if (!customerName || !email || !password) {
    console.error("Usage: tsx src/scripts/setCustomerPassword.ts <customer_name_exact> <email> <password>");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    "UPDATE customers SET email = $1, password_hash = $2 WHERE name = $3 RETURNING id, name, email",
    [email, hash, customerName]
  );
  if (!rows[0]) {
    console.error(`no customer found with name ${customerName}`);
    process.exit(1);
  }
  console.log("customer portal login set:", rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
