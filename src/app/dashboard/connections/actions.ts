"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { runSync, saveMoney } from "@/lib/sync";
import { xlsxToCsv } from "@/connectors/xlsx-read";
import { parseMoneyCsv } from "@/connectors/csv-parse";
import { liveConnector } from "@/connectors/registry";
import { decrypt } from "@/lib/crypto";

export type UploadState = { error?: string; message?: string } | undefined;
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCsv(_: UploadState, form: FormData): Promise<UploadState> {
  const { workspace } = await requireWorkspace("admin");
  const file = form.get("file");
  const currency = String(form.get("currency") || "USD").toUpperCase().slice(0, 3);
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };
  if (file.size > MAX_BYTES) return { error: "That file is over 5 MB. Split it into smaller files." };
  if (/\.xls$/i.test(file.name)) return { error: "That's the old Excel format. Open it in Excel and save it as .xlsx or .csv first." };

  let parsed;
  try {
    const text = /\.xlsx$/i.test(file.name) ? await xlsxToCsv(await file.arrayBuffer()) : await file.text();
    parsed = parseMoneyCsv(text, file.name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  if (parsed.rows.length === 0) return { error: `No usable rows found. ${parsed.skipped.length} rows were skipped.` };

  const connection = await db.connection.upsert({
    where: { workspaceId_provider_externalAccountId: { workspaceId: workspace.id, provider: "csv", externalAccountId: "uploads" } },
    create: { workspaceId: workspace.id, provider: "csv", externalAccountId: "uploads", displayName: "Spreadsheet uploads" },
    update: { status: "connected" },
  });
  const run = await db.syncRun.create({ data: { connectionId: connection.id, trigger: "upload", status: "running" } });
  const n = await saveMoney(workspace.id, connection.id, "csv", parsed.rows.map((r) => ({ ...r, currency })));
  await db.syncRun.update({ where: { id: run.id }, data: { status: "success", itemsSynced: n, finishedAt: new Date() } });
  await db.connection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date() } });

  revalidatePath("/dashboard", "layout");
  const skipped = parsed.skipped.length ? ` Skipped ${parsed.skipped.length} rows (first: line ${parsed.skipped[0].line}, ${parsed.skipped[0].reason}).` : "";
  return { message: `Imported ${n} rows from ${file.name} using columns "${parsed.columns.date}" and "${parsed.columns.amount}".${skipped}` };
}

export async function syncNow(form: FormData) {
  const { workspace } = await requireWorkspace("admin");
  const id = String(form.get("id"));
  const c = await db.connection.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!c) return;
  await runSync(c.id, "manual");
  revalidatePath("/dashboard", "layout");
}

export async function disconnect(form: FormData) {
  const { workspace } = await requireWorkspace("admin");
  const id = String(form.get("id"));
  const c = await db.connection.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!c) return;
  try {
    await liveConnector(c.provider)?.disconnect?.(c, { accessToken: c.accessTokenEnc ? decrypt(c.accessTokenEnc) : undefined });
  } catch {
    // Already revoked on their side; still forget it on ours.
  }
  // Forget the connection and everything synced from it. Most tables cascade; these three keep
  // rows on connection delete (for uploads), so clear them explicitly.
  await db.$transaction([
    db.moneyTransaction.deleteMany({ where: { connectionId: c.id } }),
    db.invoice.deleteMany({ where: { connectionId: c.id } }),
    db.adMetric.deleteMany({ where: { connectionId: c.id } }),
    db.connection.delete({ where: { id: c.id } }),
  ]);
  revalidatePath("/dashboard", "layout");
}
