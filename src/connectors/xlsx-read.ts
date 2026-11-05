import Papa from "papaparse";

/** Reads the first non-empty sheet of an .xlsx file and returns it as CSV text for the CSV importer. */
export async function xlsxToCsv(data: ArrayBuffer) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheet = wb.worksheets.find((ws) => ws.actualRowCount > 0);
  if (!sheet) throw new Error("That workbook has no data.");
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const out: string[] = [];
    for (let c = 1; c <= sheet.actualColumnCount; c++) {
      const cell = row.getCell(c);
      const v = cell.value;
      // Dates become YYYY-MM-DD; formulas use their result; everything else uses the text Excel shows.
      if (v instanceof Date) out.push(v.toISOString().slice(0, 10));
      else if (v && typeof v === "object" && "result" in v) {
        const r = (v as { result: unknown }).result;
        out.push(r instanceof Date ? r.toISOString().slice(0, 10) : String(r ?? ""));
      } else if (typeof v === "number") out.push(String(v));
      else out.push(cell.text ?? "");
    }
    rows.push(out);
  });
  return Papa.unparse(rows);
}
