import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { ENTRANT_COLUMNS, mapEntrant } from "@/lib/server/entrant-map";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ridernetId = String(body.ridernetId ?? "").trim();
    const competitionNumber = String(body.competitionNumber ?? "").trim();

    if (!ridernetId || !competitionNumber) {
      return NextResponse.json(
        { error: "Enter both RideNet ID and competition number." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("entrants")
      .select(ENTRANT_COLUMNS)
      .eq("ridernet_id", ridernetId)
      .eq("competition_number", competitionNumber)
      .limit(2);

    if (error) throw error;

    if (!data || data.length !== 1) {
      return NextResponse.json(
        { error: "Entry not found. Check the details and try again." },
        { status: 404 }
      );
    }

    return NextResponse.json({ entrant: mapEntrant(data[0]) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to check the entry." }, { status: 500 });
  }
}
