/**
 * Largest notes file the import accepts. Kept apart from lib/importNotes so the
 * browser and next.config.ts can read it without pulling in the PDF and Word parsers.
 */
export const MAX_IMPORT_MB = 25;
export const MAX_IMPORT_BYTES = MAX_IMPORT_MB * 1024 * 1024;
