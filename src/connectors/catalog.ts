// Every app the dashboard plans to support, from the Integration Map.
// "available" connectors work today; the rest show in the UI with their wave.

export type Section = "money" | "marketing" | "communication" | "sales" | "people";
export type ConnectMethod = "oauth" | "unified-api" | "upload" | "built-in";

export interface CatalogEntry {
  id: string;
  name: string;
  section: Section;
  method: ConnectMethod;
  wave: 1 | 2 | 3 | 4;
  blurb: string;
  available: boolean;
}

export const CATALOG: CatalogEntry[] = [
  { id: "stripe", name: "Stripe", section: "money", method: "oauth", wave: 1, available: true, blurb: "Sales, refunds, fees and payouts, live through webhooks." },
  { id: "csv", name: "Spreadsheet upload (CSV)", section: "money", method: "upload", wave: 1, available: true, blurb: "Import spending, sales or labor you track in Excel. Save the sheet as CSV first." },
  { id: "square", name: "Square", section: "money", method: "oauth", wave: 1, available: false, blurb: "Sales by location and item, staff hours and labor cost." },
  { id: "quickbooks", name: "QuickBooks Online", section: "money", method: "oauth", wave: 1, available: false, blurb: "Profit and loss, unpaid invoices, bills and expenses." },
  { id: "xero", name: "Xero", section: "money", method: "oauth", wave: 1, available: false, blurb: "Profit and loss, invoices and expenses." },
  { id: "plaid", name: "Bank accounts (Plaid)", section: "money", method: "unified-api", wave: 1, available: false, blurb: "Balances, transactions and cash runway." },
  { id: "google-sheets", name: "Google Sheets", section: "money", method: "oauth", wave: 1, available: false, blurb: "Spreadsheets that stay up to date on their own." },

  { id: "google-ads", name: "Google Ads", section: "marketing", method: "oauth", wave: 2, available: false, blurb: "Spend, clicks, leads and return on ad spend." },
  { id: "meta-ads", name: "Meta Ads", section: "marketing", method: "oauth", wave: 2, available: false, blurb: "Facebook and Instagram ad spend and results." },
  { id: "tiktok-ads", name: "TikTok Ads", section: "marketing", method: "oauth", wave: 2, available: false, blurb: "Spend, views and conversions." },
  { id: "social-organic", name: "Organic social", section: "marketing", method: "oauth", wave: 2, available: false, blurb: "Followers, reach and top posts across Instagram, TikTok and YouTube." },
  { id: "ga4", name: "Google Analytics", section: "marketing", method: "oauth", wave: 2, available: false, blurb: "Website visitors, sources and conversions." },

  { id: "outlook", name: "Outlook mail and calendar", section: "communication", method: "oauth", wave: 3, available: false, blurb: "Inbox, unanswered customers, today's schedule." },
  { id: "gmail", name: "Gmail", section: "communication", method: "oauth", wave: 3, available: false, blurb: "Send first, then the full inbox after Google's security review." },
  { id: "google-calendar", name: "Google Calendar", section: "communication", method: "oauth", wave: 3, available: false, blurb: "Schedule and team availability." },
  { id: "twilio", name: "Phone and SMS", section: "communication", method: "built-in", wave: 3, available: false, blurb: "Call and text from the browser, with transcripts." },

  { id: "hubspot", name: "HubSpot", section: "sales", method: "oauth", wave: 4, available: false, blurb: "Deals by stage and overdue follow-ups." },
  { id: "merge-crm", name: "Other CRMs (Salesforce, Pipedrive, Zoho...)", section: "sales", method: "unified-api", wave: 4, available: false, blurb: "One connection through Merge." },
  { id: "merge-hris", name: "Payroll (Gusto, ADP, Rippling...)", section: "people", method: "unified-api", wave: 4, available: false, blurb: "Headcount, payroll cost and labor share of revenue." },
  { id: "timesheets", name: "Timesheets (Homebase, Deputy...)", section: "people", method: "oauth", wave: 4, available: false, blurb: "Hours, overtime, scheduled vs. actual." },
];

export const SECTION_LABELS: Record<Section, string> = {
  money: "Money",
  marketing: "Marketing",
  communication: "Communication",
  sales: "Sales and customers",
  people: "People and payroll",
};

export function catalogFor(section: Section) {
  return CATALOG.filter((c) => c.section === section);
}

export function findCatalog(id: string) {
  return CATALOG.find((c) => c.id === id);
}
