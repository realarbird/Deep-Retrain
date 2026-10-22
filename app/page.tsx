import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Landing } from "@/components/Landing";
import { auth0Configured } from "@/lib/auth0";
import { demoModeEnabled, getIdentity } from "@/lib/identity";

export default function Page() {
  return (
    <Suspense fallback={<Splash />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const identity = await getIdentity();
  if (!identity) return <Landing auth0Enabled={auth0Configured} demoEnabled={demoModeEnabled()} />;
  return <AppShell user={{ name: identity.name, mode: identity.mode, picture: identity.picture }} />;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-ink-3">Loading…</p>
    </div>
  );
}
