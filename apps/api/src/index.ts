// Local/traditional-host entrypoint — starts a long-running server.
// Vercel's serverless entrypoint (api/index.ts) imports `app` directly
// instead, since a serverless function must never call .listen().
import { app } from "./app.js";

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`daak api listening on :${port}`);
});
