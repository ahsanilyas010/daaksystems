const SOPS = [
  {
    id: "SOP-01",
    title: "Booking & acceptance",
    points: [
      "No parcel enters the system without: consignee phone verified format, weight recorded on calibrated scale, contents declared, prohibited-items checklist signed off.",
      "Label printed at booking. No handwritten CNs.",
      "COD amount confirmed with sender via portal or recorded call before dispatch.",
    ],
  },
  {
    id: "SOP-02",
    title: "Pickup",
    points: [
      "Rider must scan every parcel at pickup. Unscanned = not picked, no exceptions.",
      "Photo of parcel stack + sender signature in app.",
      "Pickup cutoff time published per zone (e.g., booked by 4pm = picked same day).",
    ],
  },
  {
    id: "SOP-03",
    title: "Carrier handover",
    points: [
      "Handover manifest generated per carrier per day. Carrier rep signs digitally or on paper (scanned in). Discrepancy at handover raises an immediate exception, not a note in a spreadsheet.",
    ],
  },
  {
    id: "SOP-04",
    title: "In-transit monitoring",
    points: [
      "48-hour no-movement rule: auto-flag, ops must contact carrier within 4 working hours and log the response.",
      "Lost declaration only after documented 3-touch escalation; triggers claim workflow against carrier and compensation workflow toward sender per published policy.",
    ],
  },
  {
    id: "SOP-05",
    title: "Delivery & returns",
    points: [
      "Delivery requires POD from carrier API or rider (photo/OTP for own deliveries).",
      "Failed attempt requires a reason code from a fixed list. 2 failed attempts → CS calls consignee same day. 3 → return initiated automatically, sender notified with reason.",
      "Returned parcels physically verified against manifest within 24h of arrival; sender notified for collection/redelivery decision.",
    ],
  },
  {
    id: "SOP-06",
    title: "COD handling (highest-risk area)",
    points: [
      "Carrier COD remittance reconciled shipment-by-shipment within 24h of receipt — never lump-sum accepted.",
      "Sender payouts on a fixed published cycle (e.g., Mon/Thu), only for DELIVERED + carrier_in received parcels.",
      "Any COD variance > PKR 0 goes to a dispute queue with owner and deadline.",
      "Segregate COD float from operating cash. Daily COD position report to owner.",
    ],
  },
  {
    id: "SOP-07",
    title: "Claims & liability",
    points: [
      "Published liability policy: declared value coverage, claim window (e.g., 7 days from delivery/loss declaration), evidence required.",
      "Every lost/damaged parcel = a claim record with status, not a WhatsApp conversation.",
    ],
  },
  {
    id: "SOP-08",
    title: "Data discipline",
    points: [
      "No Excel side-ledgers. If it happened, it is in the system.",
      "Locked dropdowns everywhere free text caused chaos before (status, city, rider, paid).",
      "Daily automated backup, monthly restore test.",
    ],
  },
];

export function Sops() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Standard Operating Procedures</h1>
      <p className="mb-4 text-sm text-slate-500">
        FedEx's edge isn't software alone — every parcel movement has one owner, one scan, and one clock (plan.md section 5).
      </p>
      <div className="space-y-4">
        {SOPS.map((sop) => (
          <div key={sop.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-slate-900">
              <span className="mr-2 rounded bg-slate-900 px-2 py-0.5 font-mono text-xs text-white">{sop.id}</span>
              {sop.title}
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              {sop.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
