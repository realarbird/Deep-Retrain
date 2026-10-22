import { connection, NextResponse } from "next/server";
import { errorResponse, HttpError, requireIdentity } from "@/lib/api";
import { extractNotesText, MAX_IMPORT_BYTES, UnsupportedFileError } from "@/lib/importNotes";

export const maxDuration = 60;

/** Read an uploaded notes file and return its text for the ingest editor. Nothing is stored. Signed-in learners only. */
export async function POST(request: Request) {
  await connection();
  try {
    const identity = await requireIdentity();
    if (identity.mode !== "auth0") throw new HttpError(403, "Sign in to import notes from a file.");

    const form = await request.formData().catch(() => {
      throw new HttpError(400, "Send the file as multipart form data.");
    });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a file to import.");
    if (file.size > MAX_IMPORT_BYTES) throw new HttpError(413, "That file is over 5 MB. Split it or paste the part you need.");

    const result = await extractNotesText(file.name, new Uint8Array(await file.arrayBuffer())).catch((err) => {
      if (err instanceof UnsupportedFileError) throw new HttpError(415, err.message);
      console.warn("[import] could not read file:", (err as Error).message);
      throw new HttpError(422, "That file couldn't be read. If it's a scanned PDF, it may not contain any text.");
    });
    if (!result.text) throw new HttpError(422, "No text was found in that file. Scanned PDFs need OCR first.");

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
