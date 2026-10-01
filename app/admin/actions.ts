"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { adminAccess } from "@/lib/streams/server";
import { runAdminLogin } from "@/lib/streams/admin-login";
import { HOUR_MS, parseStreamSource, parseZone, PROVIDERS, UUID, validateOptions, validateWindow, type StreamOption } from "@/lib/streams/domain";
import { validateLocalInstant } from "@/lib/streams/time";

export type ActionResult = { ok: boolean; message: string };
const denied: ActionResult = { ok: false, message: "Admin access could not be verified. Sign in again or contact the owner." };
const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export async function login(form: FormData): Promise<ActionResult> {
  const result = await runAdminLogin({ email: field(form, "email").trim(), password: field(form, "password") }, async () => {
    const client = await createAuthClient();
    if (!client) return null;
    return {
      signIn: async (credentials) => {
        const { data, error } = await client.auth.signInWithPassword(credentials);
        return { error: Boolean(error) || !data.user || !data.session };
      },
      checkAccess: async () => (await adminAccess()).status,
      signOut: async () => {
        const { error } = await client.auth.signOut({ scope: "local" });
        return { error: Boolean(error) };
      },
    };
  });
  if (!result.ok) return result;
  redirect("/admin");
}

export async function logout(): Promise<ActionResult> {
  try {
    const client = await createAuthClient();
    if (!client) return denied;
    // Clearing this session is allowed even if membership was revoked.
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { ok: false, message: "Sign out failed. Please try again." };
  } catch { return { ok: false, message: "Sign out failed. Please try again." }; }
  redirect("/admin/login");
}

export async function saveSlot(form: FormData): Promise<ActionResult> {
  const { client, status } = await adminAccess();
  if (status !== "admin" || !client) return denied;
  let payload;
  let id;
  try {
    id = field(form, "id");
    if (id && !UUID.test(id)) throw new Error("The slot reference is invalid. Reload this page.");
    const title = field(form, "title").trim();
    if (!title || title.length > 120) throw new Error("Enter a title of 1–120 characters.");
    const starts_at = field(form, "starts_at");
    validateLocalInstant(field(form, "local_start"), field(form, "timezone"), starts_at);
    const ends_at = new Date(Date.parse(starts_at) + HOUR_MS).toISOString();
    validateWindow(starts_at, ends_at);
    const count = Number(field(form, "count"));
    if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error("Each slot needs 1–4 stream options.");
    const options: StreamOption[] = [];
    for (let index = 0; index < count; index++) {
      const provider = PROVIDERS.find((item) => item === field(form, `provider_${index}`));
      if (!provider) throw new Error("Choose Twitch, a YouTube video, or a YouTube channel.");
      const option: StreamOption = { provider, id: parseStreamSource(provider, field(form, `source_${index}`)), label: field(form, `label_${index}`).trim() };
      const zone = parseZone(field(form, `zone_${index}`));
      if (zone) option.zone = zone;
      options.push(option);
    }
    payload = { title, starts_at, ends_at, options: validateOptions(options), published: field(form, "published") === "on" };
    if (id && !payload.published) {
      const { data, error } = await client.from("stream_slots").select("published").eq("id", id).maybeSingle();
      if (error || !data) return { ok: false, message: "The slot could not be read. Reload before editing." };
      if (data.published && field(form, "confirm_unpublish") !== "yes") return { ok: false, message: "Confirm removing this slot from the public schedule." };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Check the slot details." };
  }
  try {
    const result = id
      ? await client.from("stream_slots").update(payload).eq("id", id).select("id").maybeSingle()
      : await client.from("stream_slots").insert(payload).select("id").single();
    if (result.error?.code === "23P01") return { ok: false, message: "This hour overlaps another published slot. Change the start time or save as a draft." };
    if (result.error || !result.data) return { ok: false, message: "Slot not saved. Check your access and reload the schedule before retrying." };
  } catch { return { ok: false, message: "Save could not be confirmed. Reload the schedule before retrying to avoid duplicates." }; }
  revalidatePath("/admin");
  revalidatePath("/watch");
  revalidatePath("/road-to");
  return { ok: true, message: payload.published ? "Slot published. The room refreshes within 30 seconds." : "Draft saved. It is not visible in the room." };
}

export async function deleteSlot(form: FormData): Promise<ActionResult> {
  const { client, status } = await adminAccess();
  if (status !== "admin" || !client) return denied;
  const id = field(form, "id");
  if (!UUID.test(id) || field(form, "confirm") !== "delete") return { ok: false, message: "Confirm deletion first." };
  try {
    const { data, error } = await client.from("stream_slots").delete().eq("id", id).select("id").maybeSingle();
    if (error || !data) return { ok: false, message: "Deletion could not be confirmed. Reload the schedule before retrying." };
  } catch { return { ok: false, message: "Deletion could not be confirmed. Reload the schedule before retrying." }; }
  revalidatePath("/admin");
  revalidatePath("/watch");
  return { ok: true, message: "Slot deleted." };
}
