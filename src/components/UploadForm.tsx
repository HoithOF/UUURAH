"use client";

import { useActionState } from "react";
import { uploadCsv, type UploadState } from "@/app/dashboard/connections/actions";

export function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadCsv, undefined);
  return (
    <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input type="file" name="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required aria-label="Spreadsheet file" />
      <select name="currency" defaultValue="USD" aria-label="Currency" className="btn">
        {["USD", "CAD", "EUR", "GBP", "AUD"].map((c) => <option key={c}>{c}</option>)}
      </select>
      <button className="btn" disabled={pending}>{pending ? "Importing..." : "Upload"}</button>
      {state?.error && <div className="error" style={{ width: "100%" }}>{state.error}</div>}
      {state?.message && <div className="notice" style={{ width: "100%" }}>{state.message}</div>}
    </form>
  );
}
