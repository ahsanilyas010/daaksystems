export const SHIPMENT_STATUSES = [
  "BOOKED", "PICKUP_ASSIGNED", "PICKED", "HANDED_TO_CARRIER", "IN_TRANSIT",
  "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_INITIATED", "RETURNED", "LOST",
  "DAMAGED", "CANCELLED",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface Shipment {
  id: number;
  daak_tracking_no: string;
  carrier_id: number | null;
  carrier_name: string | null;
  carrier_tracking_no: string | null;
  customer_id: number;
  customer_name: string;
  consignee_name: string;
  consignee_phone: string | null;
  consignee_address: string | null;
  city_id: number | null;
  city_name: string | null;
  city_code: string | null;
  weight_kg: string | null;
  pieces: number;
  declared_value: string | null;
  cod_amount: string;
  dc_amount: string;
  carrier_cost: string | null;
  profit: string | null;
  service_type: string;
  status: ShipmentStatus;
  status_updated_at: string;
  booked_at: string;
  pickup_rider_id: number | null;
  rider_name: string | null;
  picked_at: string | null;
  delivered_at: string | null;
  return_reason: string | null;
  attempts_count: number;
}

export interface ShipmentEvent {
  id: number;
  shipment_id: number;
  status: ShipmentStatus;
  source: string;
  location: string | null;
  note: string | null;
  actor: string | null;
  created_at: string;
}

export interface ShipmentDetail extends Shipment {
  events: ShipmentEvent[];
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  cnic: string | null;
  address: string | null;
  rate_card_id: number | null;
  rate_card_name: string | null;
  cod_payout_method: string | null;
  credit_limit: string;
  created_at: string;
}

export interface RateCard {
  id: number;
  name: string;
  base_weight_kg: string;
  base_rate: string;
  per_kg_increment: string;
  cod_fee_pct: string;
  fuel_surcharge_pct: string;
}

export interface City {
  id: number;
  name: string;
  code: string;
  zone: string | null;
}

export interface Carrier {
  id: number;
  name: string;
  active: boolean;
}

export interface Rider {
  id: number;
  name: string;
  code: string;
}

export interface CodLedgerEntry {
  id: number;
  shipment_id: number;
  direction: "carrier_in" | "sender_out";
  amount: string;
  method: string | null;
  reference_no: string | null;
  reconciled_against: number | null;
  status: "pending" | "received" | "paid";
  created_at: string;
  daak_tracking_no: string;
  shipment_cod_amount: string;
  customer_id: number;
  customer_name: string;
}

export interface CodDispute extends CodLedgerEntry {
  variance: string;
}

export interface PayoutPreviewRow {
  shipment_id: number;
  daak_tracking_no: string;
  cod_amount: string;
  dc_amount: string;
  payable_amount: string;
  carrier_in_amount: string;
  carrier_in_id: number;
}

export interface PayoutPreview {
  shipments: PayoutPreviewRow[];
  total: number;
  count: number;
}

export interface RiderRun {
  id: number;
  rider_id: number;
  rider_name: string;
  rider_code: string;
  run_date: string;
  pickups_count: number;
  payout_per_pickup: string;
  total_payout: string;
  paid_at: string | null;
}

export interface ProfitReportRow {
  group_label: string;
  shipment_count: string;
  total_profit: string;
  avg_profit_per_parcel: string;
  total_cod: string;
  total_dc: string;
}

export interface CarrierStatusMapEntry {
  id: number;
  carrier_id: number;
  carrier_name: string;
  carrier_status: string;
  mapped_status: ShipmentStatus;
}

export interface CarrierInvoice {
  id: number;
  invoice_no: string;
  carrier_id: number;
  carrier_name: string;
  period_start: string;
  period_end: string;
  claimed_amount: string;
  computed_amount: string | null;
  variance: string | null;
  status: "open" | "matched" | "disputed" | "paid";
  file_url: string | null;
  created_at: string;
}
