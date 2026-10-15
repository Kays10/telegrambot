import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function uploadPasswordIsValid(supplied: string | null): supplied is string {
  const expected = process.env.PDF_UPLOAD_PASSWORD;

  if (!expected || !supplied) {
    return false;
  }

  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const password = request.headers.get("x-document-upload-password");
  if (!uploadPasswordIsValid(password)) {
    return NextResponse.json({ error: "Invalid upload password" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      filename?: unknown;
      size?: unknown;
      objectName?: unknown;
    };

    if (
      typeof body.filename !== "string" ||
      !body.filename.toLowerCase().endsWith(".pdf") ||
      typeof body.size !== "number" ||
      !Number.isSafeInteger(body.size) ||
      body.size < 1 ||
      body.size > MAX_FILE_SIZE ||
      (body.objectName !== undefined &&
        (typeof body.objectName !== "string" ||
          !/^[0-9a-f-]{36}\.pdf$/i.test(body.objectName)))
    ) {
      return NextResponse.json(
        { error: "Choose a PDF no larger than 50 MB" },
        { status: 400 },
      );
    }

    const rpc =
      typeof body.objectName === "string"
        ? {
            name: "resume_cybersecurity_pdf_upload",
            args: {
              p_filename: body.filename.slice(0, 255),
              p_object_name: body.objectName,
              p_upload_password: password,
            },
          }
        : {
            name: "reserve_cybersecurity_pdf_upload",
            args: {
              p_filename: body.filename.slice(0, 255),
              p_upload_password: password,
            },
          };
    const { data, error } = await getSupabaseClient().rpc(rpc.name, rpc.args);

    if (error) {
      if (typeof body.objectName === "string" && error.message.includes("expired")) {
        return NextResponse.json(
          { error: "Upload reservation expired; restarting upload" },
          { status: 409 },
        );
      }
      throw new Error(`Could not reserve PDF upload: ${error.message}`);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase configuration is missing");
    }

    const storageHost = new URL(supabaseUrl).hostname.replace(
      /\.supabase\.co$/,
      ".storage.supabase.co",
    );

    return NextResponse.json({
      objectName: typeof body.objectName === "string" ? body.objectName : data,
      endpoint: `https://${storageHost}/storage/v1/upload/resumable`,
      anonKey: supabaseAnonKey,
    });
  } catch (error) {
    console.error("Could not prepare cybersecurity PDF upload:", error);
    return NextResponse.json(
      { error: "Could not prepare this PDF upload" },
      { status: 500 },
    );
  }
}
