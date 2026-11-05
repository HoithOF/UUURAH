import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { merge, mergeHrisConnector } from "@/connectors/merge-hris";

export async function POST() {
  const { user, workspace } = await requireWorkspace("admin");
  if (!mergeHrisConnector.isConfigured()) return NextResponse.json({ error: "Payroll connections aren't set up on the server." }, { status: 503 });
  const r = await merge<{ link_token: string }>("/integrations/create-link-token", undefined, {
    method: "POST",
    body: JSON.stringify({ end_user_origin_id: workspace.id, end_user_organization_name: workspace.name, end_user_email_address: user.email, categories: ["hris"] }),
  });
  return NextResponse.json({ linkToken: r.link_token });
}
