// Vercel serverless entrypoint. vercel.json rewrites every request here;
// the Express app in src/app.ts still does its own internal routing based
// on the original req.url, exactly as it does under a traditional host.
import { app } from "../src/app.js";

export default app;
