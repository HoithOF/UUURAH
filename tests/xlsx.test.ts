import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { xlsxToCsv } from "../src/connectors/xlsx-read.ts";
import { parseMoneyCsv } from "../src/connectors/csv-parse.ts";

test("an Excel sheet with real dates, numbers and a formula imports like a CSV", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Spending");
  ws.addRow(["Date", "Description", "Category", "Amount"]);
  ws.addRow([new Date(Date.UTC(2026, 9, 3)), "Shingles", "Materials", -1250.5]);
  ws.addRow([new Date(Date.UTC(2026, 9, 4)), "Roof job, Smith", "Sales", 8400]);
  ws.addRow([new Date(Date.UTC(2026, 9, 5)), "Dumpster", "Materials", { formula: "-200-150", result: -350 }]);
  const buf = await wb.xlsx.writeBuffer();
  const csv = await xlsxToCsv(buf as ArrayBuffer);
  assert.match(csv, /^Date,Description,Category,Amount/);
  const parsed = parseMoneyCsv(csv, "spending.xlsx");
  assert.equal(parsed.rows.length, 3);
  assert.equal(parsed.rows[0].amountCents, -125050);
  assert.equal(parsed.rows[0].occurredAt.toISOString().slice(0, 10), "2026-10-03");
  assert.equal(parsed.rows[2].amountCents, -35000);
  assert.equal(parsed.rows[1].kind, "sale");
});
