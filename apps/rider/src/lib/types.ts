export interface AuthedRider {
  id: number;
  name: string;
  code: string;
}

export interface RiderShipment {
  id: number;
  daak_tracking_no: string;
  consignee_name: string;
  consignee_phone: string | null;
  consignee_address: string | null;
  cod_amount: string;
  weight_kg: string | null;
  pieces: number;
  status: string;
  customer_name: string;
  city_name: string | null;
}

export interface TodayEarnings {
  pickups_count: number;
  payout_per_pickup: string;
  total_payout: string;
  paid_at: string | null;
}
