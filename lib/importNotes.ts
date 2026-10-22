/** Turn an uploaded notes file (Markdown, text, PDF or Word) into plain text for the ingest editor. */
import { MAX_NOTES_CHARS } from "@/lib/validation";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const IMPORT_EXTENSIONS = [".md", ".markdown", ".txt", ".pdf", ".docx"] as const;

export class UnsupportedFileError extends Error {}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base.slice(0, 120) || "Imported notes";
}

/** Normalize line endings, drop trailing spaces and runs of blank lines. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.join("\n\n");
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export async function extractNotesText(
  fileName: string,
  bytes: Uint8Array,
): Promise<{ title: string; text: string; truncated: boolean }> {
  const ext = extensionOf(fileName);
  let raw: string;
  if (ext === ".pdf") raw = await pdfText(bytes);
  else if (ext === ".docx") raw = await docxText(bytes);
  else if ((IMPORT_EXTENSIONS as readonly string[]).includes(ext)) raw = new TextDecoder("utf-8").decode(bytes);
  else throw new UnsupportedFileError(`Import .md, .txt, .pdf or .docx files. "${ext || fileName}" isn't supported.`);

  const text = tidyText(raw);
  return {
    title: titleFromFileName(fileName),
    text: text.slice(0, MAX_NOTES_CHARS),
    truncated: text.length > MAX_NOTES_CHARS,
  };
}
