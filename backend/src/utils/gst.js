/**
 * GST helpers — state codes, GSTIN parsing, tax split, amount in words.
 */

/** GST state / UT codes (first two digits of a GSTIN). */
export const GST_STATES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export const STATE_CODES = Object.keys(GST_STATES);

/** 15-character GSTIN: 2-digit state, 10-char PAN, entity no., 'Z', checksum. */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** HSN (goods) / SAC (services) code: 4, 6 or 8 digits. */
export const HSN_REGEX = /^(\d{4}|\d{6}|\d{8})$/;

/** State code from a GSTIN, or null. */
export const stateFromGstin = (gstin) => {
  const code = gstin?.slice(0, 2);
  return code && GST_STATES[code] ? code : null;
};

/** { code, name } for a state code, or null. */
export const stateInfo = (code) => (code && GST_STATES[code] ? { code, name: GST_STATES[code] } : null);

/**
 * Split a line's tax (in paise) into CGST/SGST (same state) or IGST
 * (different state). CGST gets the extra paisa when the tax is odd, so
 * the parts always add back to the exact tax.
 */
export const splitTax = (taxPaise, interState) => {
  if (interState) return { cgst: 0, sgst: 0, igst: taxPaise };
  const cgst = Math.ceil(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst, igst: 0 };
};

// ─── Amount in words (Indian numbering: lakh, crore) ──────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);

const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
};

const integerToWords = (n) => {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
};

/** 1234.5 → "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only" */
export const amountInWords = (rupees) => {
  const paiseTotal = Math.round((Number(rupees) || 0) * 100);
  const r = Math.floor(paiseTotal / 100);
  const p = paiseTotal % 100;
  return `Rupees ${integerToWords(r)}${p ? ` and ${twoDigits(p)} Paise` : ""} Only`;
};
