import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("scrutineering_checklist")
    .select("id,code,section,item_name,requirement,display_order,is_required")
    .eq("is_active", true)
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checklist: data ?? [] });
}
