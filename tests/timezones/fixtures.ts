// Synthetic parser fixtures, not an IANA release or production place catalog.
import { IANA_SOURCE, type Catalog } from "../../supabase/functions/_shared/catalog";

export function sourceFiles() {
  const countries = Array.from({ length: 200 }, (_, i) =>
    `${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`);
  return new Map([
    ["version", "2026d\n"],
    ["iso3166.tab", countries.map((code) => `${code}\tSynthetic ${code}`).join("\n")],
    ["zone.tab", Array.from({ length: 350 }, (_, i) => `${countries[i % countries.length]}\t+0000+00000\tSynthetic/Place_${i}`).join("\n")],
    ["backward", "# Synthetic aliases\nLink Synthetic/Place_0 Synthetic/Old_Place\n"],
  ]);
}

export function tar(files = sourceFiles()): Uint8Array {
  const chunks: Buffer[] = [];
  for (const [name, text] of files) {
    const body = Buffer.from(text);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write("ustar\0", 257, 6);
    header.write("00", 263, 2);
    const sum = header.reduce((total, b) => total + b, 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

export function catalog(zones: Catalog["zones"]): Catalog {
  return { version: "2026d", source: IANA_SOURCE, zones: zones.map(({ zoneName, countryCode, countryName }) => ({ zoneName, countryCode, countryName })) };
}
