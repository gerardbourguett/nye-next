const LOCAL_DATE = /^(20\d{2}|2100)-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function localParts(value: string) {
  const match = LOCAL_DATE.exec(value);
  if (!match) throw new Error("Enter a complete date and time within years 2000–2100.");
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = parts;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day ||
      check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) throw new Error("Enter a valid calendar date and time.");
  return parts;
}

function formatter(zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function formattedLocal(date: Date, format: Intl.DateTimeFormat) {
  const parts = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function toLocalInput(utc: string, zone: string) {
  return formattedLocal(new Date(utc), formatter(zone));
}

/** Verify the browser conversion again on the server in its declared IANA zone. */
export function validateLocalInstant(local: string, zone: string, utc: string) {
  localParts(local);
  if (typeof zone !== "string" || zone.length > 100 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(utc)) {
    throw new Error("Could not verify the timezone and time. Reload and try again.");
  }
  let format: Intl.DateTimeFormat;
  try { format = formatter(zone); } catch { throw new Error("Your timezone is unsupported."); }
  const date = new Date(utc);
  if (!Number.isFinite(date.getTime()) || formattedLocal(date, format) !== local) {
    throw new Error("This local time does not exist or its timezone changed. Choose another time.");
  }
  // Reject repeated wall times rather than silently choosing one side of a DST fold.
  for (let minutes = -180; minutes <= 180; minutes++) {
    if (minutes && formattedLocal(new Date(date.getTime() + minutes * 60_000), format) === local) {
      throw new Error("This time occurs twice because clocks change. Choose an unambiguous time.");
    }
  }
}

export function localToUtc(local: string, zone: string) {
  const [year, month, day, hour, minute] = localParts(local);
  const date = new Date(year, month - 1, day, hour, minute);
  const utc = date.toISOString();
  validateLocalInstant(local, zone, utc);
  return utc;
}
