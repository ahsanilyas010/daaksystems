import pg from "pg";

const { Pool, types } = pg;

// node-pg returns int8/BIGINT (our *.id columns are BIGSERIAL) as strings by
// default, to avoid silent precision loss above 2^53. Our ids never get
// remotely that large, and returning them as strings breaks every zod
// z.number() validator on the API surface (shipment_id, etc.) — parse as
// a normal JS number instead.
types.setTypeParser(20, (value) => parseInt(value, 10));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
