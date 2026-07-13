import { randomBytes, randomUUID } from "crypto";
import { requireAuthenticatedRequest } from "../../../lib/auth";
import { intakeEmailAddress, isEmailIntakeConfigured } from "../../../lib/email-intake";
import { supabaseServerClient } from "../../../lib/supabase-server";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;

  if (!isEmailIntakeConfigured()) {
    return Response.json({ error: "Email intake is not configured on this deployment." }, { status: 503 });
  }

  const supabase = supabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured for email intake." }, { status: 503 });
  }

  const body = (await request.json()) as { courseId?: string; date?: string; title?: string };
  const courseId = cleanString(body.courseId);
  if (!courseId) return Response.json({ error: "Choose a course before preparing OneNote email intake." }, { status: 400 });

  const id = randomUUID();
  const emailToken = randomBytes(14).toString("base64url").toLowerCase();
  const { data, error } = await supabase
    .from("lecturevault_email_intake")
    .insert({
      id,
      email_token: emailToken,
      course_id: courseId,
      reconstruction_title: cleanString(body.title) || "Untitled reconstruction",
      class_date: cleanString(body.date) || null,
      status: "awaiting_email"
    })
    .select()
    .single();

  if (error || !data) {
    return Response.json({ error: error?.message || "Could not create the OneNote email intake." }, { status: 500 });
  }

  return Response.json({
    intake: {
      ...data,
      emailAddress: intakeEmailAddress(emailToken)
    }
  });
}

export async function GET(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "id is required." }, { status: 400 });

  const supabase = supabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured for email intake." }, { status: 503 });

  const { data, error } = await supabase
    .from("lecturevault_email_intake")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Email intake was not found." }, { status: 404 });

  return Response.json({ intake: { ...data, emailAddress: intakeEmailAddress(data.email_token) } });
}

export async function DELETE(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "id is required." }, { status: 400 });

  const supabase = supabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured for email intake." }, { status: 503 });

  const { error } = await supabase.from("lecturevault_email_intake").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ deleted: true });
}
