// Dependency-free CSV parsing/writing for the Admin lead import/export
// workflows. No external CSV library is in package.json — these are the
// only two places CSV is touched in the app, so a small hand-written
// implementation avoids adding a dependency for it.

/** RFC 4180-ish parser: handles quoted fields, embedded commas/newlines,
 * and doubled-quote escaping. Trims a trailing blank line. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseCsvWithHeader(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [] };
  const headers = all[0].map((h) => h.trim().toLowerCase());
  const rows = all.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}

/** Standard OWASP CSV-injection mitigation: a cell whose content starts
 * with a formula-triggering character gets a leading apostrophe so
 * Excel/Sheets render it as text instead of evaluating it, in addition
 * to the usual quote/escape wrapping. Applied to every export and to the
 * sample-CSV download. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(columns: readonly string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  return lines.join("\r\n");
}

export const LEAD_IMPORT_COLUMNS = [
  "business_name",
  "category",
  "address",
  "neighborhood",
  "city",
  "state",
  "postal_code",
  "website",
  "social_url",
  "decision_maker",
  "contact_title",
  "email",
  "phone",
  "staffing_problems",
  "typical_roles",
  "hiring_frequency",
  "best_contact_method",
  "notes",
  "source",
  "consent_status",
] as const;

export const SAMPLE_LEAD_CSV = toCsv(LEAD_IMPORT_COLUMNS, [
  {
    business_name: "Example Coffee Roasters",
    category: "Restaurant",
    address: "123 Main St",
    neighborhood: "Elmwood Village",
    city: "Buffalo",
    state: "NY",
    postal_code: "14222",
    website: "https://example-coffee.com",
    social_url: "https://instagram.com/examplecoffee",
    decision_maker: "Jamie Rivera",
    contact_title: "Owner",
    email: "jamie@example-coffee.com",
    phone: "716-555-0100",
    staffing_problems: "Short-staffed on weekend mornings",
    typical_roles: "barista|host",
    hiring_frequency: "Weekly",
    best_contact_method: "visit",
    notes: "Walked in, spoke with Jamie directly",
    source: "Walked by",
    consent_status: "Verbal consent to follow up given in person",
  },
]);

// ── normalization + duplicate detection ───────────────────────────────

export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(the|inc|llc|co|corp|restaurant|cafe)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");
}

export function normalizeWebsiteDomain(url: string): string {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^www\./, "").trim();
  }
}

export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const CONTACT_METHOD_ALIASES: Record<string, string> = {
  visit: "visit",
  "in-person": "visit",
  "in person": "visit",
  call: "call",
  phone: "call",
  email: "email",
  social: "social",
  referral: "referral",
};
