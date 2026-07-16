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
