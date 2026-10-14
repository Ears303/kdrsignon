import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isAdmin } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("scrutineering_submissions")
    .select(
      "id,submitted_at,rider_name,competition_number,class_name,vehicle_description,status,is_junior,scrutineering_check_results(result)"
    )
    .order("submitted_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const submissions = (data ?? []).map((s: any) => {
    const results = s.scrutineering_check_results ?? [];
    return {
      id: s.id,
      submittedAt: s.submitted_at,
      riderName: s.rider_name,
      competitionNumber: s.competition_number,
      className: s.class_name,
      vehicleDescription: s.vehicle_description,
      status: s.status,
      isJunior: s.is_junior,
      passCount: results.filter((r: any) => r.result === "pass").length,
      failCount: results.filter((r: any) => r.result === "fail").length,
      naCount: results.filter((r: any) => r.result === "na").length,
    };
  });

  return NextResponse.json({ submissions });
}
