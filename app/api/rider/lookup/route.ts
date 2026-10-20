import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { ENTRANT_COLUMNS, mapEntrant } from "@/lib/server/entrant-map";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ridernetId = String(body.ridernetId ?? "").trim();

    if (!ridernetId) {
      return NextResponse.json({ error: "Enter your RidernetID." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("entrants")
      .select(ENTRANT_COLUMNS)
      .eq("ridernet_id", ridernetId)
      .limit(20);

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Entry not found. Check your RidernetID and try again." },
        { status: 404 }
      );
    }

    // A rider may have more than one entry (e.g. two machines or classes).
    // Return them all so the page can ask which one this form is for.
    return NextResponse.json({ entrants: data.map(mapEntrant) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to check the entry." }, { status: 500 });
  }
}
