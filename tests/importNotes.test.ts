import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractNotesText, tidyText, titleFromFileName, UnsupportedFileError } from "@/lib/importNotes";
import { MAX_NOTES_CHARS } from "@/lib/validation";

const bytes = (text: string) => new TextEncoder().encode(text);
const fixture = async (name: string) => new Uint8Array(await readFile(path.join(import.meta.dirname, "fixtures", name)));

describe("importing notes files", () => {
  it("reads Markdown and text files and titles the deck from the file name", async () => {
    const r = await extractNotesText("cell_biology-week-3.md", bytes("# Cells\r\n\r\n\r\n\r\nMitochondria make ATP.   \r\n"));
    expect(r).toEqual({ title: "cell biology week 3", text: "# Cells\n\nMitochondria make ATP.", truncated: false });
  });

  it("pulls the text out of PDF and Word files", async () => {
    const pdf = await extractNotesText("notes.pdf", await fixture("notes.pdf"));
    expect(pdf.text).toContain("Mitochondria make ATP.");

    const docx = await extractNotesText("notes.docx", await fixture("notes.docx"));
    expect(docx.text).toBe("Glycolysis\n\nGlycolysis splits glucose into two pyruvate in the cytoplasm.");
  });

  it("cuts long files to the ingest limit and says so", async () => {
    const r = await extractNotesText("long.txt", bytes("a".repeat(MAX_NOTES_CHARS + 10)));
    expect(r.text).toHaveLength(MAX_NOTES_CHARS);
    expect(r.truncated).toBe(true);
  });

  it("rejects file types it can't read", async () => {
    await expect(extractNotesText("slides.pptx", bytes("x"))).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it("rejects a corrupt PDF instead of returning junk", async () => {
    await expect(extractNotesText("broken.pdf", bytes("not a pdf"))).rejects.toThrow();
  });

  it("tidies whitespace and names", () => {
    expect(tidyText("a \t\n\n\n\nb")).toBe("a\n\nb");
    expect(titleFromFileName(".pdf")).toBe("Imported notes");
  });
});
