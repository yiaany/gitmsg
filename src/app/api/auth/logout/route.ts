import { NextRequest } from "next/server";
import { failure, json, sameOrigin, sessionCookie } from "@/lib/server";
export async function POST(request: NextRequest) {
  try { sameOrigin(request); const response = json({ ok: true }); sessionCookie(response, "", 0); return response; }
  catch (error) { return failure(error); }
}
