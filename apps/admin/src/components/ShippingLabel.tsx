import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";
import type { Shipment } from "../lib/types";

// 4x6" thermal label, print CSS per plan.md section 6 ("browser print CSS
// for 4x6 thermal labels, barcode via JsBarcode").
export function ShippingLabel({ shipment }: { shipment: Shipment }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, shipment.daak_tracking_no, {
        format: "CODE128",
        displayValue: true,
        fontSize: 16,
        height: 60,
        margin: 4,
      });
    }
  }, [shipment.daak_tracking_no]);

  return (
    <div className="label-4x6 mx-auto flex w-[4in] flex-col gap-2 border border-black p-3 text-black print:border-0">
      <div className="flex items-center justify-between border-b border-black pb-1">
        <span className="text-lg font-bold">DAAK COURIER</span>
        <span className="text-xs">{shipment.service_type.toUpperCase()}</span>
      </div>
      <svg ref={svgRef} className="w-full" />
      <div className="text-xs">
        <div className="font-semibold">FROM: {shipment.customer_name}</div>
      </div>
      <div className="border-t border-black pt-1 text-sm">
        <div className="font-semibold">TO: {shipment.consignee_name}</div>
        {shipment.consignee_phone && <div>{shipment.consignee_phone}</div>}
        {shipment.consignee_address && <div>{shipment.consignee_address}</div>}
        <div>{shipment.city_name ?? ""}</div>
      </div>
      <div className="flex justify-between border-t border-black pt-1 text-xs">
        <span>Weight: {shipment.weight_kg ?? "-"} kg</span>
        <span>Pieces: {shipment.pieces}</span>
      </div>
      <div className="flex justify-between text-sm font-bold">
        <span>COD: PKR {shipment.cod_amount}</span>
      </div>
    </div>
  );
}
