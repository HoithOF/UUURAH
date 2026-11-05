import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { browserPhoneToken } from "@/lib/twilio";

export const dynamic = "force-dynamic";

// Short-lived token that lets this browser make and take calls on the company's number.
export async function GET() {
  const { user, workspace } = await requireWorkspace();
  const token = await browserPhoneToken(workspace.id, user.id);
  if (!token) return NextResponse.json({ error: "No phone number yet" }, { status: 404 });
  return NextResponse.json({ token }, { headers: { "cache-control": "no-store" } });
}
