import { IANA_SOURCE, isCatalog, validVersion, validZoneName, type Catalog, type CatalogZone } from "./catalog.ts";

export const MAX_COMPRESSED = 2_000_000;
export const MAX_EXPANDED = 8_000_000;
const MAX_FILE = 1_000_000;
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Bounds reads even when Content-Length is missing or dishonest. */
export async function readBounded(stream: ReadableStream<Uint8Array>, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("size_limit");
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Read-only POSIX ustar subset: never extract files, links, or paths. */
export function parseTar(bytes: Uint8Array): Map<string, string> {
  if (bytes.length > MAX_EXPANDED || bytes.length % 512 !== 0) throw new Error("archive_invalid");
  const selected = new Set(["version", "zone.tab", "iso3166.tab", "backward"]);
  const files = new Map<string, string>();
  const seen = new Set<string>();
  const text = (b: Uint8Array) => decoder.decode(b).split("\0", 1)[0];
  const octal = (b: Uint8Array) => {
    const value = text(b).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error("archive_invalid");
    return parseInt(value, 8);
  };
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) {
      if (bytes.length - offset < 1024 || !bytes.subarray(offset).every((b) => b === 0)) throw new Error("archive_invalid");
      if (files.size !== selected.size) throw new Error("archive_missing_files");
      return files;
    }
    let checksum = 0;
    header.forEach((b, i) => { checksum += i >= 148 && i < 156 ? 32 : b; });
    const name = text(header.subarray(0, 100));
    const size = octal(header.subarray(124, 136));
    if (checksum !== octal(header.subarray(148, 156)) ||
        text(header.subarray(257, 263)) !== "ustar" ||
        text(header.subarray(345, 500)) !== "" ||
        !/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === ".." ||
        ![0, 48].includes(header[156]) || size > MAX_FILE ||
        seen.has(name) || seen.size >= 100 || offset + 512 + size > bytes.length) throw new Error("archive_invalid");
    seen.add(name);
    if (selected.has(name)) files.set(name, decoder.decode(bytes.subarray(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("archive_invalid");
}

export function parseCatalog(files: Map<string, string>, previous: CatalogZone[]): Catalog {
  for (const name of ["version", "zone.tab", "iso3166.tab", "backward"]) {
    if (!files.has(name) || files.get(name)!.length > MAX_FILE) throw new Error("archive_missing_files");
  }
  const version = files.get("version")!.trim();
  if (!validVersion(version)) throw new Error("version_invalid");
  const lines = (name: string) => files.get(name)!.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
  const countries = new Map<string, string>();
  for (const line of lines("iso3166.tab")) {
    const fields = line.split("\t");
    if (fields.length !== 2 || !/^[A-Z]{2}$/.test(fields[0]) || !fields[1] || countries.has(fields[0])) throw new Error("catalog_invalid");
    countries.set(fields[0], fields[1]);
  }
  const zones = new Map<string, CatalogZone>();
  for (const line of lines("zone.tab")) {
    const [countryCode, coordinates, zoneName, ...comments] = line.split("\t");
    if (!countries.has(countryCode) || !/^[+-]\d{4}(?:\d{2})?[+-]\d{5}(?:\d{2})?$/.test(coordinates) ||
        !zoneName || !validZoneName(zoneName) || comments.length > 1 || zones.has(zoneName)) throw new Error("catalog_invalid");
    zones.set(zoneName, { zoneName, countryCode, countryName: countries.get(countryCode)! });
  }
  const links = new Map<string, { target: string; preferred?: string }>();
  for (const line of lines("backward")) {
    const fields = line.split("#")[0].trim().split(/\s+/);
    if (fields[0] !== "Link") {
      // Modern backward also contains Rule/Zone records; these are not place metadata.
      if (!["Rule", "Zone"].includes(fields[0]) && !/^\s/.test(line)) throw new Error("catalog_invalid");
      continue;
    }
    const [, target, alias] = fields;
    if (fields.length !== 3 || !validZoneName(target) || !validZoneName(alias) || links.has(alias)) throw new Error("catalog_invalid");
    links.set(alias, { target, preferred: line.match(/#=\s+(\S+)/)?.[1] });
  }
  const canonical = (name: string): string => {
    const visited = new Set<string>();
    while (links.has(name)) {
      if (visited.has(name) || visited.size >= 32) throw new Error("alias_invalid");
      visited.add(name);
      name = links.get(name)!.target;
    }
    return name;
  };
  for (const alias of links.keys()) canonical(alias);
  // Existing names survive only with official same-country metadata or a proven Link.
  for (const old of previous) {
    let metadata = zones.get(old.zoneName);
    if (!metadata) {
      const link = links.get(old.zoneName);
      if (!link) throw new Error("coverage_loss");
      const preferred = link.preferred;
      if (preferred && canonical(preferred) === canonical(old.zoneName)) metadata = zones.get(preferred);
      metadata ??= zones.get(link.target) ?? zones.get(canonical(old.zoneName));
    }
    if (!metadata || metadata.countryCode !== old.countryCode) throw new Error("coverage_loss");
    zones.set(old.zoneName, { zoneName: old.zoneName, countryCode: metadata.countryCode, countryName: old.countryName });
  }
  const catalog = { version, source: IANA_SOURCE, zones: [...zones.values()].sort((a, b) => a.zoneName < b.zoneName ? -1 : 1) };
  if (!isCatalog(catalog) || zones.size < 350 || countries.size < 200) throw new Error("catalog_invalid");
  return catalog;
}

export async function fetchCatalog(previous: CatalogZone[], fetcher: typeof fetch = fetch): Promise<Catalog> {
  const signal = AbortSignal.timeout(25_000);
  const response = await fetcher(IANA_SOURCE, { signal, redirect: "error", cache: "no-store" });
  if (!response.ok || response.url !== IANA_SOURCE || !response.body) throw new Error("upstream_unavailable");
  const compressed = await readBounded(response.body, MAX_COMPRESSED, signal);
  const expanded = await readBounded(
    new Blob([new Uint8Array(compressed)]).stream().pipeThrough(new DecompressionStream("gzip")), MAX_EXPANDED, signal,
  );
  return parseCatalog(parseTar(expanded), previous);
}
