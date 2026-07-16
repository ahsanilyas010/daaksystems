import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

// Usage: tsx src/scripts/createUser.ts "Name" email@example.com password role
async function main() {
  const [name, email, password, role] = process.argv.slice(2);
  if (!name || !email || !password || !role) {
    console.error('Usage: tsx src/scripts/createUser.ts "Name" email password admin|ops|finance|cs');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
     RETURNING id, name, email, role`,
    [name, email, hash, role]
  );
  console.log("created/updated user:", rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
