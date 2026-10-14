import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { ENTRANT_COLUMNS } from "@/lib/server/entrant-map";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ridernetId = String(body.ridernetId ?? "").trim();
    const competitionNumber = String(body.competitionNumber ?? "").trim();
    const entrantId = String(body.entrantId ?? "");
    const riderPrintedName = String(body.riderPrintedName ?? "").trim();
    const parentName = String(body.parentGuardianPrintedName ?? "").trim();
    const isJunior = Boolean(body.isJunior);
    const declarationAccepted = body.declarationAccepted === true;
    const answers: any[] = Array.isArray(body.answers) ? body.answers : [];

    if (!ridernetId || !competitionNumber || !entrantId || !riderPrintedName || !declarationAccepted) {
      return NextResponse.json({ error: "Required submission details are missing." }, { status: 400 });
    }
    if (isJunior && !parentName) {
      return NextResponse.json({ error: "Parent or guardian name is required." }, { status: 400 });
    }

    // Re-check the entrant on the server so the browser cannot fake it
    const { data: entrants, error: entrantError } = await supabaseAdmin
      .from("entrants")
      .select(ENTRANT_COLUMNS)
      .eq("id", entrantId)
      .eq("ridernet_id", ridernetId)
      .eq("competition_number", competitionNumber)
      .limit(1);
    if (entrantError) throw entrantError;

    const entrant: any = entrants?.[0];
    if (!entrant) {
      return NextResponse.json({ error: "Entry validation failed." }, { status: 403 });
    }

    const { data: required, error: requiredError } = await supabaseAdmin
      .from("scrutineering_checklist")
      .select("id,code")
      .eq("is_active", true)
      .eq("is_required", true);
    if (requiredError) throw requiredError;

    const answerMap = new Map<string, string | undefined>(
      answers.map((a) => [String(a.checklistId), a.result])
    );

    const missing = (required ?? []).find((item) => !answerMap.get(item.id));
    if (missing) {
      return NextResponse.json({ error: "Complete every required checklist item." }, { status: 400 });
    }

    const hydration = (required ?? []).find((item) => item.code === "HYDRATION");
    if (hydration && answerMap.get(hydration.id) !== "pass") {
      return NextResponse.json(
        { error: "The 2 litre water / CamelBak requirement must be PASS to submit." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("scrutineering_submissions")
      .insert({
        entrant_id: entrant.id,
        event_id: entrant.event_id,
        rider_name: entrant.primary_name,
        class_name: entrant.class_name,
        competition_number: String(entrant.competition_number),
        vehicle_description: entrant.vehicle_description,
        registration_number: entrant.registration_number,
        is_junior: isJunior,
        declaration_accepted: true,
        rider_printed_name: riderPrintedName,
        rider_signature: riderPrintedName,
        rider_signed_at: now,
        parent_guardian_printed_name: isJunior ? parentName : null,
        parent_guardian_signature: isJunior ? parentName : null,
        parent_guardian_signed_at: isJunior ? now : null,
        status: answers.some((a) => a.result === "fail") ? "requires_review" : "submitted",
      })
      .select("id")
      .single();
    if (submissionError) throw submissionError;

    const rows = answers
      .filter((a) => a.result)
      .map((a) => ({
        submission_id: submission.id,
        checklist_id: String(a.checklistId),
        result: String(a.result),
        comment: String(a.comment ?? "").trim() || null,
      }));

    const { error: resultError } = await supabaseAdmin
      .from("scrutineering_check_results")
      .insert(rows);

    if (resultError) {
      await supabaseAdmin.from("scrutineering_submissions").delete().eq("id", submission.id);
      throw resultError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error?.message ?? "Submission failed." }, { status: 500 });
  }
}
