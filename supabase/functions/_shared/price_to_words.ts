/**
 * price_to_words.ts — single source of truth for converting a Philippine
 * peso amount (e.g. a negotiated price per kilogram) into words for
 * contract PDFs.
 *
 * This replaces three previously-duplicated `numberToWords()` copies in
 * ai-negotiate/index.ts, generate-contract/index.ts, and
 * sign-contract/index.ts — all of which had the same bug: they called
 * `Math.round()` on the FULL decimal price before converting to words,
 * which silently dropped centavos and could round the peso amount up by 1
 * (e.g. 37.50 → Math.round → 38 → "Thirty Eight Pesos", while the PDF's
 * numeric field still correctly showed "PhP 37.50"). Numeric and
 * word-form values must always represent the exact same amount.
 *
 * Root-cause fix: split the amount into its integer peso part and its
 * decimal centavo part FIRST (never rounding the combined decimal value),
 * convert each independently, and only join them with "and ... Centavos"
 * when there are centavos to report.
 */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function chunk(num: number): string {
  if (num === 0) return "";
  if (num < 20)  return ONES[num] + " ";
  if (num < 100) return TENS[Math.floor(num / 10)] + (num % 10 ? " " + ONES[num % 10] : "") + " ";
  return ONES[Math.floor(num / 100)] + " Hundred " + chunk(num % 100);
}

/** Converts a non-negative WHOLE number (no decimals) into words. */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  let result = "";
  if (n >= 1_000_000) { result += chunk(Math.floor(n / 1_000_000)) + "Million "; n %= 1_000_000; }
  if (n >= 1_000)     { result += chunk(Math.floor(n / 1_000))     + "Thousand "; n %= 1_000; }
  if (n > 0)           result += chunk(n);
  return result.trim();
}

/**
 * Converts a decimal peso amount (e.g. 37.5, 35.25) into words, e.g.:
 *   37.00 → "Thirty Seven Pesos"
 *   37.25 → "Thirty Seven Pesos and Twenty Five Centavos"
 *   37.50 → "Thirty Seven Pesos and Fifty Centavos"
 *   37.75 → "Thirty Seven Pesos and Seventy Five Centavos"
 *
 * The peso and centavo portions are derived from the SAME `amount` value
 * that is displayed numerically elsewhere in the PDF — never a separately
 * rounded value — so the numeric and written amounts always match exactly.
 */
export function priceToWords(amount: number): string {
  // Work in integer centavos to avoid floating-point drift (e.g. 37.1 * 100
  // producing 3709.999999999999 due to binary floating-point rounding).
  const totalCentavos = Math.round(amount * 100);
  const pesos    = Math.floor(totalCentavos / 100);
  const centavos = totalCentavos % 100;

  const pesosWords = `${integerToWords(pesos)} ${pesos === 1 ? "Peso" : "Pesos"}`;

  if (centavos === 0) return pesosWords;

  const centavosWords = `${integerToWords(centavos)} ${centavos === 1 ? "Centavo" : "Centavos"}`;
  return `${pesosWords} and ${centavosWords}`;
}
