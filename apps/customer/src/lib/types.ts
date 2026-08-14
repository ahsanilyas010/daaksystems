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

export interface ExtractedOrder {
  source_order_ref: string | null;
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
}

export interface IngestionBatch {
  id: number;
  source: "pdf_upload" | "whatsapp" | "email" | "shopify_webhook";
  source_ref: string | null;
  uploaded_at: string;
  status: "processing" | "needs_review" | "committed" | "failed";
  item_count: number;
  error_count: number;
}

export interface IngestionItem {
  id: number;
  batch_id: number;
  parsed_json: ExtractedOrder | null;
  confidence_score: string | null;
  match_status: "new" | "possible_duplicate" | "duplicate";
  committed_shipment_id: number | null;
}

export interface IngestionBatchDetail extends IngestionBatch {
  items: IngestionItem[];
}
