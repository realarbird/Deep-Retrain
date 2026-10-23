import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  effectiveDailyCapFor,
  getAccountState,
  reconcileAccount,
  saveSettings,
  syncAccountExtras,
  type AccountState,
} from "@/lib/account";
import { HttpError, readJson, safeAfter, withIdentity } from "@/lib/api";
import { DEVICE_HEADER, forgetDevice, validDeviceId } from "@/lib/devices";
import { localDateKey } from "@/lib/retention";
import { settingsPatchSchema } from "@/lib/settingsSchema";
import { sanitizeOffset } from "@/lib/timezone";

const patchBodySchema = z.object({
  settings: settingsPatchSchema,
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
});

function payload(state: AccountState, request: NextRequest, tz: number) {
  const now = new Date();
  const capToday = effectiveDailyCapFor(state.settings, now, tz);
  return {
    settings: state.settings,
    devices: state.devices,
    sync: state.sync,
    thisDevice: validDeviceId(request.headers.get(DEVICE_HEADER)),
    capToday,
    capFromTomorrow: state.settings.dailyCap,
  };
}

/** The learner's settings, devices and sync status. */
export const GET = withIdentity(async (identity, request: NextRequest) => {
  const tz = sanitizeOffset(request.nextUrl.searchParams.get("tz"));
  const state = await getAccountState(identity);
  if (state.reconcile.push || state.reconcile.mirror) safeAfter("reconcile", () => reconcileAccount(identity, state));
  return NextResponse.json(payload(state, request, tz));
});

/** Change settings. Signed-in learners' changes go to their Auth0 account, so every device picks them up. */
export const PATCH = withIdentity(async (identity, request: NextRequest) => {
  const { settings, tzOffsetMinutes } = patchBodySchema.parse(await readJson(request));
  const now = new Date();
  const state = await saveSettings(identity, settings, { now, todayKey: localDateKey(now, tzOffsetMinutes) });
  return NextResponse.json(payload(state, request, tzOffsetMinutes));
});

/** Forget a device: it drops off the list (it isn't signed out; that needs more Auth0 access than this app asks for). */
export const DELETE = withIdentity(async (identity, request: NextRequest) => {
  const id = validDeviceId(request.nextUrl.searchParams.get("device"));
  if (!id) throw new HttpError(400, "Which device? Pass ?device=<id>.");
  const tz = sanitizeOffset(request.nextUrl.searchParams.get("tz"));
  const state = await getAccountState(identity);
  const devices = forgetDevice(state.devices, id);
  await syncAccountExtras(identity, { devices }, new Date());
  return NextResponse.json(payload({ ...state, devices }, request, tz));
});
