export interface AuthedCustomer {
  id: number;
  name: string;
}

export interface Shipment {
  id: number;
  daak_tracking_no: string;
  consignee_name: string;
  consignee_phone: string | null;
  city_id: number | null;
  city_name: string | null;
  carrier_name: string | null;
  cod_amount: string;
  dc_amount: string;
  weight_kg: string | null;
  pieces: number;
  status: string;
  booked_at: string;
  return_reason: string | null;
}

export interface WalletBucket {
  total: number;
  count: number;
}

export interface Wallet {
  pending: WalletBucket;
  cleared: WalletBucket;
  paid_out: WalletBucket;
}

export interface StatementEntry {
  direction: "carrier_in" | "sender_out";
  amount: string;
  method: string | null;
  status: string;
  created_at: string;
  daak_tracking_no: string;
}

export interface City {
  id: number;
  name: string;
  code: string;
}

export interface RateEstimate {
  rate_card: string;
  base_charge: number;
  fuel_surcharge: number;
  cod_fee: number;
  estimated_total: number;
}
