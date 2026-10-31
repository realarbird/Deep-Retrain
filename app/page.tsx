import { Suspense } from "react";
import { AppDownloads } from "@/components/apps/AppDownloads";
import { AppShell } from "@/components/AppShell";
import { Landing } from "@/components/Landing";
import { auth0Configured } from "@/lib/auth0";
import { demoModeEnabled, getIdentity } from "@/lib/identity";
import { latestMacRelease } from "@/lib/macRelease";

export default function Page() {
  return (
    <Suspense fallback={<Splash />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const identity = await getIdentity();
  // Streams in on its own, so a slow answer from GitHub never holds up the page.
  const apps = (
    <Suspense fallback={<AppDownloads mac={null} />}>
      <LatestAppDownloads />
    </Suspense>
  );
  if (!identity) return <Landing auth0Enabled={auth0Configured} demoEnabled={demoModeEnabled()} apps={apps} />;
  return <AppShell user={{ name: identity.name, mode: identity.mode, picture: identity.picture }} apps={apps} />;
}

async function LatestAppDownloads() {
  return <AppDownloads mac={await latestMacRelease()} />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-ink-3">Loading…</p>
    </div>
  );
}
