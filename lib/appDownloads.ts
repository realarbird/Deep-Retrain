/** Where the native apps live. Shared by the server (release lookup) and the download buttons. */
export const GITHUB_REPO = "realarbird/Deep-Retrain";
export const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.arbird.deepretain";
/** Google Play only shows the Android app to members of this group while it's in testing. */
export const TESTERS_GROUP = "deepretain@googlegroups.com";
export const TESTERS_GROUP_URL = "https://groups.google.com/g/deepretain";

/** The newest published GitHub release that has a Mac disk image. */
export interface MacRelease {
  /** "1.0", from a tag like "v1.0" */
  version: string;
  name: string;
  publishedAt: string | null;
  /** The release notes as written on GitHub (Markdown). */
  notes: string;
  downloadUrl: string;
  fileName: string;
  size: number;
  pageUrl: string;
}

export type NoteBlock = { kind: "heading"; text: string } | { kind: "list"; items: string[] } | { kind: "paragraph"; text: string };

/** Strips the Markdown that would show up as stray symbols: emphasis, code ticks, link syntax. */
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .trim();
}

/**
 * Release notes are Markdown, but only a little of it: headings, bullet lists and paragraphs.
 * They're rendered as text, never as HTML, so nothing in a release body can run on the page.
 */
export function releaseNoteBlocks(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    if (list?.length) blocks.push({ kind: "list", items: list });
    paragraph = [];
    list = null;
  };

  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: "heading", text: plain(heading[1]) });
    } else if (item) {
      if (paragraph.length) flush();
      (list ??= []).push(plain(item[1]));
    } else if (list && /^\s/.test(raw)) {
      // An indented line continues the bullet above it.
      list[list.length - 1] += ` ${plain(line)}`;
    } else {
      if (list) flush();
      paragraph.push(plain(line));
    }
  }
  flush();
  return blocks.filter((b) => (b.kind === "list" ? b.items.length : b.text));
}

export function formatSize(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** Fixed locale and zone, so the server and the browser print the same date. */
export function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
