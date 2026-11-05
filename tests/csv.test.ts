import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoneyCsv, parseAmountToCents, parseDate } from "../src/connectors/csv-parse.ts";

test("amounts in common spreadsheet formats", () => {
  assert.equal(parseAmountToCents("$1,234.50"), 123450);
  assert.equal(parseAmountToCents("(45.00)"), -4500);
  assert.equal(parseAmountToCents("-12"), -1200);
  assert.equal(parseAmountToCents("12-"), -1200);
  assert.equal(parseAmountToCents("abc"), null);
});

test("dates: ISO and US style", () => {
  assert.equal(parseDate("2026-10-03")?.toISOString().slice(0, 10), "2026-10-03");
  assert.equal(parseDate("10/3/2026")?.toISOString().slice(0, 10), "2026-10-03");
  assert.equal(parseDate("13/45/2026"), null);
});

test("a simple sheet with sales and expenses", () => {
  const csv = "Date,Description,Category,Amount\n2026-10-01,Client A,Services,1500\n2026-10-02,Rent,Office,-2000\n,broken,,5\n2026-10-03,Client A,Services,1500\n";
  const r = parseMoneyCsv(csv, "oct.csv");
  assert.equal(r.rows.length, 3);
  assert.equal(r.skipped.length, 1);
  assert.deepEqual(r.rows.map((x) => x.kind), ["sale", "expense", "sale"]);
  assert.equal(r.rows[1].amountCents, -200000);
});

test("debit/credit bank export and type column", () => {
  const csv = "Posted Date,Payee,Debit,Credit,Type\n10/01/2026,Payroll,3000.00,,Payroll\n10/02/2026,Stripe,,850.00,Deposit\n";
  const r = parseMoneyCsv(csv, "bank.csv");
  assert.equal(r.rows[0].kind, "expense");
  assert.equal(r.rows[0].amountCents, -300000);
  assert.equal(r.rows[1].amountCents, 85000);
});

test("re-uploading the same file gives the same ids; duplicates inside one file stay separate", () => {
  const csv = "Date,Amount,Memo\n2026-10-01,10,Coffee\n2026-10-01,10,Coffee\n";
  const a = parseMoneyCsv(csv, "x.csv");
  const b = parseMoneyCsv(csv, "x.csv");
  assert.deepEqual(a.rows.map((r) => r.externalId), b.rows.map((r) => r.externalId));
  assert.notEqual(a.rows[0].externalId, a.rows[1].externalId);
});

test("missing columns explain themselves", () => {
  assert.throws(() => parseMoneyCsv("Foo,Bar\n1,2\n", "x.csv"), /date column/);
});
