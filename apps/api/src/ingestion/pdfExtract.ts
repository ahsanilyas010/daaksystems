import pdfParse from "pdf-parse";

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export async function extractPdfPages(buffer: Buffer): Promise<PdfPage[]> {
  const data = await pdfParse(buffer);
  // pdf-parse joins all pages into data.text — downstream code joins pages
  // anyway, so a single-element array is equivalent to per-page splitting.
  return [{ pageNumber: 1, text: data.text }];
}

// Shopify Order Printer bundles repeat "Invoice Order #NNNN" per order and
// can wrap across pages — split on that marker across the joined full text,
// not per-page, so a wrapped invoice stays in one chunk.
const ORDER_MARKER = /Invoice\s+Order\s+#\s*(\d+)/gi;

export interface InvoiceChunk {
  sourceOrderRef: string;
  text: string;
}

export function splitShopifyInvoices(pages: PdfPage[]): InvoiceChunk[] {
  const fullText = pages.map((p) => p.text).join("\n");
  const matches = [...fullText.matchAll(ORDER_MARKER)];
  if (matches.length === 0) return [];

  const chunks: InvoiceChunk[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : fullText.length;
    chunks.push({
      sourceOrderRef: `#${matches[i][1]}`,
      text: fullText.slice(start, end).trim(),
    });
  }
  return chunks;
}

// Carrier airway bills (PostEx etc.) are one shipment per PDF/page, not a
// repeating marker — treat the whole document as a single chunk.
export function airwayBillChunk(pages: PdfPage[]): InvoiceChunk[] {
  const fullText = pages.map((p) => p.text).join("\n");
  return [{ sourceOrderRef: "", text: fullText.trim() }];
}

// Heuristic router: a Shopify bundle repeats the order marker, an airway
// bill doesn't. Cheap and correct enough to gate which extraction prompt
// runs — worst case a misroute still goes through Claude extraction and
// gets flagged low-confidence rather than silently mis-parsed.
export function detectPdfKind(pages: PdfPage[]): "shopify_bundle" | "airway_bill" {
  const fullText = pages.map((p) => p.text).join("\n");
  const matches = fullText.match(ORDER_MARKER);
  return matches && matches.length > 0 ? "shopify_bundle" : "airway_bill";
}
