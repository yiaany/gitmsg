import { NextRequest } from "next/server";
import { failure, getSession, json, sameOrigin } from "@/lib/server";

/** Retained for old clients, but sign-in no longer creates an inbox. */
export async function POST(request: NextRequest) {
  try { sameOrigin(request); await getSession(); return json({ error: "Automatic onboarding is retired. Create or connect a conversation explicitly." }, 410); }
  catch (error) { return failure(error); }
}
