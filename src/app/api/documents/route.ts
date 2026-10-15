import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await getSupabaseClient().rpc(
      "list_cybersecurity_documents",
    );

    if (error) {
      throw new Error(`Could not list cybersecurity documents: ${error.message}`);
    }

    return NextResponse.json({ documents: data ?? [] });
  } catch (error) {
    console.error("Failed to list cybersecurity documents:", error);
    return NextResponse.json(
      { error: "Could not load the document library" },
      { status: 500 },
    );
  }
}
