import { describe, expect, it } from "vitest";
import { formatReleaseDate, formatSize, releaseNoteBlocks } from "@/lib/appDownloads";
import { pickMacRelease } from "@/lib/macRelease";

const dmg = (version: string) => ({
  name: `DeepRetain-${version}.dmg`,
  size: 6_238_791,
  browser_download_url: `https://github.com/realarbird/Deep-Retrain/releases/download/v${version}/DeepRetain-${version}.dmg`,
});
const appcast = { name: "appcast.xml", size: 799, browser_download_url: "https://github.com/realarbird/Deep-Retrain/releases/download/v1.0/appcast.xml" };

function release(version: string, publishedAt: string, extra: Record<string, unknown> = {}) {
  return {
    tag_name: `v${version}`,
    name: "DeepRetain for Mac ",
    body: `DeepRetain for Mac ${version}.`,
    html_url: `https://github.com/realarbird/Deep-Retrain/releases/tag/v${version}`,
    draft: false,
    prerelease: false,
    published_at: publishedAt,
    assets: [appcast, dmg(version)],
    ...extra,
  };
}

describe("pickMacRelease", () => {
  it("takes the newest published release that has a disk image", () => {
    const picked = pickMacRelease([
      release("1.0", "2026-10-31T02:06:27Z"),
      release("1.2", "2026-11-20T09:00:00Z"),
      release("1.1", "2026-11-10T09:00:00Z"),
    ]);
    expect(picked).toEqual({
      version: "1.2",
      name: "DeepRetain for Mac",
      publishedAt: "2026-11-20T09:00:00Z",
      notes: "DeepRetain for Mac 1.2.",
      downloadUrl: "https://github.com/realarbird/Deep-Retrain/releases/download/v1.2/DeepRetain-1.2.dmg",
      fileName: "DeepRetain-1.2.dmg",
      size: 6_238_791,
      pageUrl: "https://github.com/realarbird/Deep-Retrain/releases/tag/v1.2",
    });
  });

  it("skips drafts, prereleases and releases without a Mac build", () => {
    const picked = pickMacRelease([
      release("2.0", "2026-12-01T00:00:00Z", { draft: true }),
      release("1.9", "2026-11-30T00:00:00Z", { prerelease: true }),
      release("1.8", "2026-11-29T00:00:00Z", { assets: [{ name: "DeepRetain.apk", size: 10, browser_download_url: "https://github.com/x.apk" }] }),
      release("1.0", "2026-10-31T02:06:27Z"),
    ]);
    expect(picked?.version).toBe("1.0");
  });

  it("only links to disk images hosted on GitHub", () => {
    const elsewhere = { ...dmg("1.0"), browser_download_url: "https://example.com/DeepRetain-1.0.dmg" };
    expect(pickMacRelease([release("1.0", "2026-10-31T02:06:27Z", { assets: [elsewhere] })])).toBeNull();
  });

  it("returns null for anything that isn't a list of releases", () => {
    expect(pickMacRelease({ message: "API rate limit exceeded" })).toBeNull();
    expect(pickMacRelease([])).toBeNull();
    expect(pickMacRelease([{ tag_name: "v1.0" }])).toBeNull();
  });

  it("falls back to a default name and empty notes", () => {
    const picked = pickMacRelease([release("1.0", "2026-10-31T02:06:27Z", { name: null, body: null })]);
    expect(picked).toMatchObject({ name: "DeepRetain for Mac", notes: "" });
  });
});

describe("releaseNoteBlocks", () => {
  it("splits GitHub's release body into paragraphs", () => {
    const body =
      "DeepRetain for Mac 1.0. Requires macOS 14 or later.\r\n\r\nDownload the DMG -> open the DMG and drag DeepRetain to Applications.\r\n\r\nmacOS will say it can't verify the app.";
    expect(releaseNoteBlocks(body)).toEqual([
      { kind: "paragraph", text: "DeepRetain for Mac 1.0. Requires macOS 14 or later." },
      { kind: "paragraph", text: "Download the DMG -> open the DMG and drag DeepRetain to Applications." },
      { kind: "paragraph", text: "macOS will say it can't verify the app." },
    ]);
  });

  it("reads headings and lists, and drops Markdown symbols", () => {
    const body = "## What's new\n- **Faster** sync\n- Works [offline](https://example.com)\n  for a week\n* `Listen` mode\nThanks for testing.";
    expect(releaseNoteBlocks(body)).toEqual([
      { kind: "heading", text: "What's new" },
      { kind: "list", items: ["Faster sync", "Works offline for a week", "Listen mode"] },
      { kind: "paragraph", text: "Thanks for testing." },
    ]);
  });

  it("keeps line breaks inside a paragraph", () => {
    expect(releaseNoteBlocks("Line one\nLine two")).toEqual([{ kind: "paragraph", text: "Line one\nLine two" }]);
  });

  it("returns nothing for an empty body", () => {
    expect(releaseNoteBlocks("  \n\n ")).toEqual([]);
  });
});

describe("formatting", () => {
  it("prints sizes and dates the same everywhere", () => {
    expect(formatSize(6_238_791)).toBe("6.2 MB");
    expect(formatSize(799)).toBe("1 KB");
    expect(formatReleaseDate("2026-10-31T02:06:27Z")).toBe("Oct 31, 2026");
  });
});
