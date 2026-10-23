/**
 * Light clean-up for model-written prose shown to learners: no em or en dashes
 * used as punctuation, no doubled spaces, no stray punctuation pairs.
 */
export function plainProse(text: string): string {
  return text
    .replace(/\s*[—―]\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/,\s*([,.;:!?])/g, "$1")
    .replace(/^,\s*/, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
