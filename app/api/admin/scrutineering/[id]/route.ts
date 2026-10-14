import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isAdmin } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

const STATUSES = ["submitted", "requires_review", "accepted", "rejected"];

export async function GET(request: NextRequest, context: any) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from("scrutineering_submissions")
    .select(
      "*, scrutineering_check_results(result,comment,scrutineering_checklist(item_name,section,requirement,display_order,code))"
    )
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const checks = (data.scrutineering_check_results ?? [])
    .map((r: any) => ({
      result: r.result,
      comment: r.comment,
      itemName: r.scrutineering_checklist?.item_name,
      section: r.scrutineering_checklist?.section,
      requirement: r.scrutineering_checklist?.requirement,
      code: r.scrutineering_checklist?.code,
      order: r.scrutineering_checklist?.display_order ?? 0,
    }))
    .sort((a: any, b: any) => a.order - b.order);

  delete data.scrutineering_check_results;
  return NextResponse.json({ submission: data, checks });
}

export async function PATCH(request: NextRequest, context: any) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await request.json();
  const status = String(body.status ?? "");
  const reviewNotes = String(body.reviewNotes ?? "").trim() || null;

  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("scrutineering_submissions")
    .update({ status, review_notes: reviewNotes })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
