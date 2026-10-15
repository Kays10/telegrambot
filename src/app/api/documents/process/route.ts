import { timingSafeEqual } from "node:crypto";
import "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { NextResponse } from "next/server";
import { splitDocumentText } from "@/lib/cybersecurity";
import { getSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TEXT_SIZE = 5_000_000;

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

async function removeTemporaryUpload(
  objectName: string,
  password: string,
): Promise<void> {
  const client = getSupabaseClient();
  const { error: storageError } = await client.storage
    .from("cybersecurity-pdfs")
    .remove([objectName]);

  if (storageError) {
    throw new Error(`Could not remove temporary PDF: ${storageError.message}`);
  }

  const { error: releaseError } = await client.rpc(
    "release_cybersecurity_pdf_upload",
    { p_object_name: objectName, p_upload_password: password },
  );

  if (releaseError) {
    throw new Error(`Could not release PDF upload reservation: ${releaseError.message}`);
  }
}

export async function POST(request: Request) {
  const password = request.headers.get("x-document-upload-password");
  if (!uploadPasswordIsValid(password)) {
    return NextResponse.json({ error: "Invalid upload password" }, { status: 401 });
  }

  let objectName: string | undefined;
  let parser: PDFParse | undefined;
  let indexed = false;

  try {
    const body = (await request.json()) as {
      objectName?: unknown;
      filename?: unknown;
    };

    if (
      typeof body.objectName !== "string" ||
      !/^[0-9a-f-]{36}\.pdf$/i.test(body.objectName) ||
      typeof body.filename !== "string" ||
      !body.filename.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json({ error: "Invalid uploaded PDF" }, { status: 400 });
    }

    objectName = body.objectName;
    const client = getSupabaseClient();
    const { data: file, error: downloadError } = await client.storage
      .from("cybersecurity-pdfs")
      .download(objectName);

    if (downloadError || !file) {
      throw new Error(
        `Could not download the uploaded PDF: ${downloadError?.message ?? "File not found"}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new Error("Uploaded PDF exceeds the 50 MB limit");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
    if (!header.includes("%PDF-")) {
      throw new Error("Uploaded content is not a valid PDF");
    }

    parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText();
    const text = parsed.text.trim();

    if (!text) {
      throw new Error("No readable text found. Scanned PDFs need OCR before upload.");
    }

    if (text.length > MAX_TEXT_SIZE) {
      throw new Error("Extracted PDF text exceeds the 5 MB indexing limit");
    }

    const chunks = splitDocumentText(text);
    const { data, error } = await client.rpc("ingest_cybersecurity_document", {
      p_filename: body.filename.slice(0, 255),
      p_chunks: chunks,
      p_upload_password: password,
      p_storage_object_name: objectName,
    });

    if (error) {
      throw new Error(`Could not index PDF: ${error.message}`);
    }

    indexed = true;
    await removeTemporaryUpload(objectName, password);

    return NextResponse.json(
      { documentId: data, filename: body.filename, chunks: chunks.length },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to process cybersecurity PDF:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not process this PDF",
      },
      { status: 500 },
    );
  } finally {
    try {
      await parser?.destroy();
    } catch (error) {
      console.error("Failed to close PDF parser:", error);
    }

    if (objectName && !indexed) {
      try {
        await removeTemporaryUpload(objectName, password);
      } catch (error) {
        console.error("Failed to clean up temporary PDF upload:", error);
      }
    }
  }
}
