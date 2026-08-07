// Structured extraction via Claude (plan-order-ingestion.md section 4):
// schema-constrained tool use, not regex — the Shopify/airway-bill layouts
// are consistent but not consistent *enough* (field order, wrapping, a note
// line that only appears on some invoices) for regex to be reliable, and at
// this volume an LLM call per batch is cheap.
import Anthropic from "@anthropic-ai/sdk";

export interface ExtractedOrder {
  source_order_ref: string | null;
  order_date: string | null;
  consignee_name: string | null;
  consignee_phone: string | null;
  consignee_address: string | null;
  city: string | null;
  items: { name: string; qty: number }[];
  order_total: number | null;
  cod_amount: number | null;
  carrier_tracking_no: string | null;
  carrier: string | null;
  notes: string | null;
  field_flags: Record<string, string>; // field name -> why it's low-confidence
}

const EXTRACTION_TOOL = {
  name: "record_orders",
  description: "Record every order found in the source text as structured fields.",
  input_schema: {
    type: "object" as const,
    properties: {
      orders: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            source_order_ref: { type: ["string", "null"] },
            order_date: { type: ["string", "null"], description: "ISO 8601 date" },
            consignee_name: { type: ["string", "null"] },
            consignee_phone: { type: ["string", "null"], description: "Pakistani format 03XXXXXXXXX or +923XXXXXXXXX" },
            consignee_address: { type: ["string", "null"] },
            city: { type: ["string", "null"], description: "Only set if it clearly matches a known Pakistani city; otherwise null" },
            items: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: { name: { type: "string" }, qty: { type: "number" } },
                required: ["name", "qty"],
              },
            },
            order_total: { type: ["number", "null"] },
            cod_amount: { type: ["number", "null"] },
            carrier_tracking_no: { type: ["string", "null"] },
            carrier: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            field_flags: {
              type: "object" as const,
              description: "Map of field name -> reason it's low-confidence or missing. Empty object if nothing is flagged.",
              additionalProperties: { type: "string" },
            },
          },
          required: ["field_flags"],
        },
      },
    },
    required: ["orders"],
  },
};

const SYSTEM_PROMPT = `You extract structured order data from courier/e-commerce source text for the DAAK courier platform. Sources are Shopify order-printer invoices, carrier airway bills (PostEx etc.), or free-text WhatsApp messages.

Rules:
- Return every distinct order found in the text via the record_orders tool.
- Never invent a value. If a field isn't clearly present in the text, set it to null and add an entry to field_flags explaining why (e.g. "not present in source text", "ambiguous between two values", "phone format doesn't match Pakistani pattern").
- city must be a real Pakistani city name that clearly matches the address text. If the address doesn't clearly indicate a single city, set city to null and flag it — never guess between two plausible cities.
- consignee_phone should match 03XXXXXXXXX or +923XXXXXXXXX. If the extracted number doesn't match that shape, still return it but flag it in field_flags.
- Do not merge distinct orders together and do not split one order into two.`;

export async function extractOrders(sourceText: string): Promise<ExtractedOrder[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured — order extraction cannot run without it");
  }
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_orders" },
    messages: [{ role: "user", content: sourceText }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured extraction");
  }
  const input = toolUse.input as { orders: ExtractedOrder[] };
  return input.orders.map((o) => ({
    ...o,
    items: o.items ?? [],
    field_flags: o.field_flags ?? {},
  }));
}

// Confidence score derived from field_flags rather than asked of the model
// directly — the model naming *which* fields it's unsure about is more
// reliable than it self-reporting a single number, and this keeps the score
// auditable (recompute it from field_flags at any time).
const CRITICAL_FIELDS = ["consignee_name", "consignee_phone", "consignee_address", "city"];

export function computeConfidence(order: ExtractedOrder): number {
  const flaggedCritical = CRITICAL_FIELDS.filter((f) => f in order.field_flags).length;
  const totalFlagged = Object.keys(order.field_flags).length;
  if (flaggedCritical > 0) return Math.max(0, 0.5 - flaggedCritical * 0.15);
  if (totalFlagged > 0) return Math.max(0.5, 0.9 - totalFlagged * 0.1);
  return 0.95;
}
