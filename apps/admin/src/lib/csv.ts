// Minimal RFC-4180-ish CSV serializer — quotes any field containing a
// comma, quote, or newline, doubling embedded quotes. Good enough for
// the delivery-run export; not meant to round-trip arbitrary binary data.
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  function cell(value: string | number | null): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
