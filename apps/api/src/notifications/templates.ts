// Notification copy per status, Urdu + English (plan.md section 4.4).
// {{trackingNo}} is the only placeholder — keep templates simple enough
// that a real WhatsApp Business template review won't reject them.
export interface Template {
  en: string;
  ur: string;
}

export const STATUS_TEMPLATES: Partial<Record<string, Template>> = {
  BOOKED: {
    en: "Your parcel {{trackingNo}} has been booked with DAAK Courier. Track it: track.daak.pk/{{trackingNo}}",
    ur: "آپ کا پارسل {{trackingNo}} ڈاک کورئیر کے ساتھ بک ہو گیا ہے۔ ٹریک کریں: track.daak.pk/{{trackingNo}}",
  },
  PICKED: {
    en: "Your parcel {{trackingNo}} has been picked up and is on its way.",
    ur: "آپ کا پارسل {{trackingNo}} اٹھا لیا گیا ہے اور راستے میں ہے۔",
  },
  OUT_FOR_DELIVERY: {
    en: "Your parcel {{trackingNo}} is out for delivery today.",
    ur: "آپ کا پارسل {{trackingNo}} آج ڈیلیوری کے لیے نکل چکا ہے۔",
  },
  DELIVERED: {
    en: "Your parcel {{trackingNo}} has been delivered. Thank you for using DAAK Courier.",
    ur: "آپ کا پارسل {{trackingNo}} ڈیلیور ہو گیا ہے۔ ڈاک کورئیر استعمال کرنے کا شکریہ۔",
  },
  RETURN_INITIATED: {
    en: "Delivery of your parcel {{trackingNo}} was unsuccessful. It is being returned.",
    ur: "آپ کے پارسل {{trackingNo}} کی ڈیلیوری ناکام رہی۔ اسے واپس بھیجا جا رہا ہے۔",
  },
  RETURNED: {
    en: "Your parcel {{trackingNo}} has been returned to sender.",
    ur: "آپ کا پارسل {{trackingNo}} بھیجنے والے کو واپس کر دیا گیا ہے۔",
  },
  LOST: {
    en: "We're sorry — parcel {{trackingNo}} has been declared lost. Our team will contact you about a claim.",
    ur: "معذرت — پارسل {{trackingNo}} گم ہو گیا ہے۔ ہماری ٹیم دعوے کے بارے میں آپ سے رابطہ کرے گی۔",
  },
};

export function renderTemplate(status: string, trackingNo: string): Template | null {
  const template = STATUS_TEMPLATES[status];
  if (!template) return null;
  return {
    en: template.en.replaceAll("{{trackingNo}}", trackingNo),
    ur: template.ur.replaceAll("{{trackingNo}}", trackingNo),
  };
}
