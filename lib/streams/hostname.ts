// Pure host and address rules for stream URLs an admin pastes in. The browser
// fetches those URLs from each viewer's machine, and the server fetches them
// to check status, so anything that points inside a network is refused.

const INTERNAL_SUFFIXES = [
  ".localhost", ".local", ".localdomain", ".internal", ".lan", ".home.arpa", ".intranet", ".corp", ".private",
];

/**
 * A name that can plausibly be a public HTTPS host: lower-case letters,
 * digits, hyphens and at least one dot. IP literals (v4, v6, or the odd
 * forms the URL parser rewrites to dotted decimals) and internal suffixes
 * are refused; HTTPS certificates are issued for names, not for addresses.
 */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253 || !/^[a-z0-9.-]+$/.test(host)) return false;
  if (!host.includes(".") || host.startsWith(".") || host.includes("..")) return false;
  if (/^[0-9.]+$/.test(host)) return false;
  // The bare special-use name (home.arpa, local…) is as internal as anything under it.
  if (host === "localhost" || INTERNAL_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) return false;
  return host.split(".").every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"));
}

function ipv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function publicV4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 31 && c === 196) return false; // AS112-v4
  if (a === 192 && b === 52 && c === 193) return false; // AMT
  if (a === 192 && b === 88 && c === 99) return false; // deprecated 6to4 relay anycast
  if (a === 192 && b === 175 && c === 48) return false; // direct delegation AS112
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/** Eight 16-bit groups of an IPv6 address, or null if it is not one. */
function ipv6(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0];
  const tail = /:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const octets = ipv4(tail[1]);
    if (!octets) return null;
    text = `${text.slice(0, -tail[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string) => (part ? part.split(":") : []);
  const head = groups(halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const values = all.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN));
  return values.length === 8 && values.every((value) => !Number.isNaN(value)) ? values : null;
}

/** False for loopback, private, link-local, multicast, documentation and other non-routable addresses. */
export function isPublicAddress(address: string): boolean {
  const v4 = ipv4(address);
  if (v4) return publicV4(v4);
  const g = ipv6(address);
  if (!g) return false;
  const embedded = (hi: number, lo: number) => publicV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.every((group) => group === 0) || (g.slice(0, 7).every((group) => group === 0) && g[7] === 1)) return false;
  if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;
  if (g.slice(0, 6).every((group) => group === 0)) return embedded(g[6], g[7]); // deprecated IPv4-compatible
  if (g.slice(0, 5).every((group) => group === 0) && g[5] === 0xffff) return embedded(g[6], g[7]); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b) return g.slice(2, 6).every((group) => group === 0) && embedded(g[6], g[7]); // NAT64 well-known prefix only (not the local-use 64:ff9b:1::/48)
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4
  // Only global unicast (2000::/3) is public; everything else (site-local fec0::/10, unassigned space…) is refused.
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && (g[1] === 0x0000 || g[1] === 0x0002 || (g[1] & 0xfff0) === 0x0010 || (g[1] & 0xfff0) === 0x0020)) return false; // Teredo, benchmarking, ORCHID
  if (g[0] === 0x3fff && (g[1] & 0xf000) === 0) return false; // documentation (3fff::/20)
  return true;
}

/**
 * HTTPS, no credentials, a public host name and an ordinary port (none, or
 * 1024 and above). The one rule for every address the app contacts or hands
 * to a browser on an admin's say-so.
 */
export function isPublicHttpsUrl(url: URL): boolean {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.port && Number(url.port) < 1024) return false;
  return isPublicHostname(url.hostname);
}
