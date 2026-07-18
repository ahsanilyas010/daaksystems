import type { NotificationProvider } from "./types.js";

// STUB — plan.md section 6 wants WhatsApp Business Cloud API as primary,
// SMS as fallback. Neither is wired up (no gateway credentials exist for
// this repo). This provider exists so the rest of the notification
// pipeline — trigger points, template rendering, per-recipient dispatch —
// is real and testable today. Swap in a real provider by implementing
// NotificationProvider and changing the export in index.ts.
export const consoleProvider: NotificationProvider = {
  name: "console",
  async send(to: string, message: string): Promise<void> {
    console.log(`[notify] -> ${to}: ${message}`);
  },
};
