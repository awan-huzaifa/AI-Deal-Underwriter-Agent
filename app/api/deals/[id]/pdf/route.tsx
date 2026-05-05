import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { DealPDF } from "@/lib/pdf/deal-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: deal }, { data: report }] = await Promise.all([
    supabase.from("deals").select("*").eq("id", id).eq("user_id", user.id).single(),
    supabase.from("underwriting_reports").select("*").eq("deal_id", id).single(),
  ]);

  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderToBuffer(<DealPDF deal={deal} report={report} />);

  const slug = deal.address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-report.pdf"`,
    },
  });
}
