import { cacheLife } from "next/cache";
import { z } from "zod";
import { GITHUB_REPO, type MacRelease } from "@/lib/appDownloads";

const releaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullish(),
  body: z.string().nullish(),
  html_url: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullish(),
  assets: z.array(z.object({ name: z.string(), size: z.number(), browser_download_url: z.string() })),
});

/** Picks the newest published, non-prerelease release that ships a .dmg, from GitHub's list of releases. */
export function pickMacRelease(raw: unknown): MacRelease | null {
  const parsed = z.array(z.unknown()).safeParse(raw);
  if (!parsed.success) return null;
  const candidates = parsed.data
    .map((r) => releaseSchema.safeParse(r))
    .flatMap((r) => (r.success && !r.data.draft && !r.data.prerelease ? [r.data] : []))
    .flatMap((r) => {
      const dmg = r.assets.find((a) => /\.dmg$/i.test(a.name) && a.browser_download_url.startsWith("https://github.com/"));
      return dmg ? [{ release: r, dmg }] : [];
    })
    .sort((a, b) => (b.release.published_at ?? "").localeCompare(a.release.published_at ?? ""));
  const latest = candidates[0];
  if (!latest) return null;
  const { release, dmg } = latest;
  return {
    version: release.tag_name.replace(/^v(?=\d)/i, ""),
    name: release.name?.trim() || "DeepRetain for Mac",
    publishedAt: release.published_at ?? null,
    notes: release.body?.trim() ?? "",
    downloadUrl: dmg.browser_download_url,
    fileName: dmg.name,
    size: dmg.size,
    pageUrl: release.html_url,
  };
}

/**
 * The latest Mac build on GitHub Releases. Cached for an hour so the page doesn't call GitHub
 * on every visit (unauthenticated calls are rate-limited per IP). A failed lookup is only kept
 * for a few minutes, and the buttons fall back to the releases page meanwhile.
 */
export async function latestMacRelease(): Promise<MacRelease | null> {
  "use cache";
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "DeepRetain" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const release = pickMacRelease(await res.json());
    if (release) cacheLife("hours");
    else cacheLife("minutes");
    return release;
  } catch (err) {
    console.warn("[releases] Mac release lookup failed:", (err as Error).message);
    cacheLife("minutes");
    return null;
  }
}
