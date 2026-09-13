export type Provider = "twitch" | "youtube";
export type StreamOption = { provider: Provider; id: string; label: string };
export type Slot = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  published: boolean;
  options: StreamOption[];
};

export const HOUR_MS = 3_600_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TWITCH_ID = /^[a-z0-9_]{1,25}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export function validProviderId(provider: unknown, id: unknown): boolean {
  return typeof id === "string" &&
    (provider === "twitch" ? TWITCH_ID.test(id) : provider === "youtube" && YOUTUBE_ID.test(id));
}

/** Accept only canonical providers, never an arbitrary player URL or HTML. */
export function parseStreamSource(provider: Provider, input: string): string {
  const source = input.trim();
  let id = source;
  if (source.includes(":") || source.includes("/")) {
    let url: URL;
    try { url = new URL(source); } catch { throw new Error("Use an HTTPS provider URL or an ID."); }
    if (url.protocol !== "https:" || url.username || url.password || url.port || /[\\\s]/.test(source)) {
      throw new Error("Use an HTTPS provider URL without credentials or a port.");
    }
    if (provider === "twitch" && ["twitch.tv", "www.twitch.tv"].includes(url.hostname)) {
      id = /^\/([A-Za-z0-9_]{1,25})\/?$/.exec(url.pathname)?.[1] ?? "";
    } else if (provider === "youtube" && url.hostname === "youtu.be") {
      id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? "";
    } else if (provider === "youtube" && ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      id = url.pathname === "/watch" && url.searchParams.getAll("v").length === 1
        ? url.searchParams.get("v") ?? ""
        : /^\/(?:live|shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] ?? "";
    } else {
      throw new Error("The URL must belong to the selected provider.");
    }
  }
  if (provider === "twitch") id = id.toLowerCase();
  if (!validProviderId(provider, id)) {
    throw new Error(provider === "twitch"
      ? "Enter a Twitch channel: 1–25 letters, numbers, or underscores."
      : "Enter a YouTube video URL or its 11-character video ID, not a channel or playlist.");
  }
  return id;
}

export function validateOptions(value: unknown): StreamOption[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    throw new Error("Each slot needs 1–4 stream options.");
  }
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid stream option.");
    const option = item as Record<string, unknown>;
    if (Object.keys(option).sort().join(",") !== "id,label,provider" ||
        !validProviderId(option.provider, option.id) || typeof option.label !== "string" ||
        !option.label.trim() || option.label.length > 120 || option.label !== option.label.trim()) {
      throw new Error("Each option needs a valid provider ID and a label of 1–120 characters.");
    }
    const key = `${option.provider}:${option.id}`;
    if (seen.has(key)) throw new Error("Choose different streams within a slot.");
    seen.add(key);
    return { provider: option.provider as Provider, id: option.id as string, label: option.label };
  });
}

export function validateWindow(start: string, end: string) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from !== HOUR_MS ||
      from < Date.UTC(2000, 0, 1) || to > Date.UTC(2101, 0, 1)) {
    throw new Error("A slot must last exactly one hour, within years 2000–2100.");
  }
}

export function overlaps(a: Pick<Slot, "starts_at" | "ends_at">, b: Pick<Slot, "starts_at" | "ends_at">) {
  return Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
}

export function activeSlot(slots: Slot[], now: number): Slot | undefined {
  return slots.find((slot) => slot.published && Date.parse(slot.starts_at) <= now && now < Date.parse(slot.ends_at));
}

export function optionKey(option: StreamOption) { return `${option.provider}:${option.id}`; }

export function selectedOption(slot: Slot | undefined, selection: { slotId: string; key: string } | null) {
  if (!slot) return undefined;
  return (selection?.slotId === slot.id ? slot.options.find((option) => optionKey(option) === selection.key) : undefined)
    ?? slot.options[0];
}

export type PlaybackState = {
  selection: { slotId: string; key: string } | null;
  loadedPlayer: string | null;
};

/** Forget invalid choices and load consent; later availability cannot restore them. */
export function reconcilePlayback(state: PlaybackState, slot: Slot | undefined, canEmbed: boolean): PlaybackState {
  const selection = slot && state.selection?.slotId === slot.id &&
    slot.options.some((option) => optionKey(option) === state.selection?.key) ? state.selection : null;
  const option = selectedOption(slot, selection);
  const key = slot && option ? `${slot.id}:${optionKey(option)}` : null;
  const loadedPlayer = canEmbed && key === state.loadedPlayer ? key : null;
  return selection === state.selection && loadedPlayer === state.loadedPlayer
    ? state : { selection, loadedPlayer };
}

export function providerUrl(option: StreamOption) {
  if (!validProviderId(option.provider, option.id)) throw new Error("Invalid provider ID.");
  return option.provider === "twitch"
    ? `https://www.twitch.tv/${option.id}`
    : `https://www.youtube.com/watch?v=${option.id}`;
}

export function embedUrl(option: StreamOption, hostname: string) {
  if (!validProviderId(option.provider, option.id)) throw new Error("Invalid provider ID.");
  if (option.provider === "youtube") return `https://www.youtube.com/embed/${option.id}?autoplay=0&playsinline=1`;
  if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) throw new Error("Unsupported Twitch parent hostname.");
  return `https://player.twitch.tv/?${new URLSearchParams({ channel: option.id, parent: hostname, autoplay: "false" })}`;
}

export function decodeSlots(value: unknown): Slot[] {
  if (!Array.isArray(value)) throw new Error("Invalid schedule.");
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new Error("Invalid schedule.");
    const slot = row as Slot;
    if (typeof slot.id !== "string" || !UUID.test(slot.id) || typeof slot.title !== "string" ||
        !slot.title.trim() || slot.title.length > 120 || typeof slot.published !== "boolean" ||
        typeof slot.starts_at !== "string" || typeof slot.ends_at !== "string") throw new Error("Invalid schedule.");
    validateWindow(slot.starts_at, slot.ends_at);
    return { id: slot.id, title: slot.title, starts_at: slot.starts_at, ends_at: slot.ends_at,
      published: slot.published, options: validateOptions(slot.options) };
  });
}
