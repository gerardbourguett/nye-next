// Regenerates the relay map from Wikimedia Commons' public-domain
// "World Time Zones Map.svg" (Heitordp; outline from the CIA's Standard Time
// Zones of the World, zones from IANA tzdata). Run from the repository root:
//   pnpm exec tsx scripts/generate-map-data.ts
// Outputs:
//   - public/maps/time-zones.svg: one <g id="o<minutes>"> per UTC offset in
//     force at New Year's midnight, holding that offset's land regions
//   - data/map-offsets.json: source revision and the offsets the map draws
// Each region's offset comes from the source stylesheet (standard offset,
// striped where clocks change), shifted for southern-hemisphere summer time,
// then checked against the IANA catalog country by country. The script fails
// rather than guess when the source changes shape.
import { writeFileSync } from "node:fs";

import { resolveRolloverArrival } from "../data/relay";
import bundled from "../data/timezones.json";

const FILE = "File:World_Time_Zones_Map.svg";
const API = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(FILE)}&prop=imageinfo&iiprop=url|timestamp|extmetadata&format=json`;
const USER_AGENT = "nye-next map generator (https://github.com/gerardbourguett/nye-next)";
const YEAR = 2027; // Southern summer time is what matters; any recent New Year works.

/** Standard offset, in minutes, of each stylesheet rule keyed by its first class. */
const STANDARD: Record<string, number> = {
  ki14: 840, ki13: 780, nz1245: 765, nz12: 720, ru12: 720, nf: 660, ru11: 660,
  au1030: 630, au10: 600, ru10: 600, au930n: 570, au930: 570, ru9: 540, au845: 525,
  ru8: 480, ru7: 420, mm: 390, ru6: 360, np: 345, in: 330, ru5: 300, af: 270,
  ru4: 240, ir: 210, ru3: 180, fi: 120, ru2: 120, no: 60, tn: 60, fo: 0, gl0: 0,
  "pt-1": -60, cv: -60, "gl-2": -120, "br-2": -120, pm: -180, gf: -180,
  "ca-330": -210, "gl-4": -240, "ca-4n": -240, "ca-5": -300, "ca-5n": -300,
  "ca-6": -360, "ca-6n": -360, "ca-7": -420, "ca-7n": -420, "us-8": -480,
  "mx-8": -480, "us-9": -540, "pf-9": -540, "pf-930": -570, "us-10": -600,
  "us-10n": -600, "um-11": -660, "um-12": -720,
};

/** Regions on summer time at New Year: the southern hemisphere's DST. */
const SOUTHERN_SUMMER: Record<string, number> = {
  nz1245: 60, nz12: 60, nf: 60, au1030: 30, au10: 60, au930: 60, "cl-4": 60, "cl-6": 60,
};

/** Where IANA, not the map, is right at New Year: Morocco keeps UTC+1 outside Ramadan. */
const IANA_OVERRIDES: Record<string, number> = { ma: 60, eh: 60 };

/**
 * Remote areas IANA folds into another zone or has none for, so their
 * country's catalog offsets cannot confirm them: Crozet (+4) and the
 * Scattered Islands (+3) of the French Southern Lands, Marion Island (+3),
 * and the uninhabited US Minor Outlying Islands Navassa, Palmyra and Baker.
 */
const NO_IANA_ZONE = new Set(["tf4", "tf3", "za3", "um-5", "um-10", "um-12"]);

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Bounds of a path using only the relative m/l/h/v/z commands the source uses. */
function extendBox(box: Box, d: string) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let x = 0, y = 0, startX = 0, startY = 0, command = "";
  const add = () => {
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
  };
  for (let index = 0; index < tokens.length;) {
    if (/^[a-zA-Z]$/.test(tokens[index])) {
      command = tokens[index++];
      if (command === "z" || command === "Z") { x = startX; y = startY; continue; }
      if (!"mlhv".includes(command)) throw new Error(`Unsupported path command ${command}`);
    }
    if (command === "h") x += Number(tokens[index++]);
    else if (command === "v") y += Number(tokens[index++]);
    else {
      x += Number(tokens[index++]); y += Number(tokens[index++]);
      if (command === "m") { startX = x; startY = y; command = "l"; }
    }
    add();
  }
}

async function fetchOk(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response;
}

async function main() {
const meta = await (await fetchOk(API)).json();
const info = (Object.values(meta.query.pages)[0] as { imageinfo: { url: string; timestamp: string; extmetadata: Record<string, { value: string }> }[] }).imageinfo[0];
if (info.extmetadata.LicenseShortName?.value !== "Public domain") {
  throw new Error(`Unexpected license: ${info.extmetadata.LicenseShortName?.value}`);
}
const svg = await (await fetchOk(info.url)).text();

const viewBox = /<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(svg);
if (!viewBox) throw new Error("Missing SVG size");
const css = svg.slice(svg.indexOf("<style"), svg.indexOf("</style>"));

// Region classes in stylesheet order; ocean bands (`w…`) are nautical time.
const offsetOf = new Map<string, number>();
for (const rule of css.matchAll(/([^{}]+)\{fill:(?!none)[^}]*\}/g)) {
  const classes = rule[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((part) => part.trim().replace(/^\./, ""));
  if (classes[0].startsWith("w")) continue;
  const standard = STANDARD[classes[0]];
  if (standard === undefined) throw new Error(`Unknown stylesheet rule starting with .${classes[0]}; update STANDARD`);
  for (const name of classes) offsetOf.set(name, IANA_OVERRIDES[name] ?? standard + (SOUTHERN_SUMMER[name] ?? 0));
}

// Every region must agree with IANA for its country at New Year.
const countryOffsets = new Map<string, Set<number>>();
for (const zone of bundled.zones) {
  try {
    const { offsetMinutes } = resolveRolloverArrival(zone.zoneName, YEAR);
    const code = zone.countryCode.toLowerCase();
    countryOffsets.set(code, (countryOffsets.get(code) ?? new Set()).add(offsetMinutes));
  } catch { /* unsupported by this runtime */ }
}
const mismatches: string[] = [];
for (const [name, offset] of offsetOf) {
  const code = /^([a-z]{2})(?:-?\d+[nb]?)?$/.exec(name)?.[1];
  const known = code ? countryOffsets.get(code) : undefined;
  if (known && !known.has(offset) && !NO_IANA_ZONE.has(name)) mismatches.push(`${name}: map ${offset}, IANA ${[...known].join("/")}`);
}
if (mismatches.length) throw new Error(`Map regions disagree with IANA:\n${mismatches.join("\n")}`);

const groups = new Map<number, string[]>();
for (const element of svg.matchAll(/<path\b([^>]*?)\bd="([^"]+)"/g)) {
  const name = /class="([^"\s]+)/.exec(element[1])?.[1];
  const offset = name === undefined ? undefined : offsetOf.get(name);
  if (offset === undefined) continue;
  groups.set(offset, [...(groups.get(offset) ?? []), element[2].replace(/\s+/g, " ").trim()]);
}

const offsets = [...groups.keys()].sort((a, b) => b - a);
const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
for (const d of [...groups.values()].flat()) extendBox(box, d);
const pad = 6;
const crop = [box.minX - pad, box.minY - pad, box.maxX - box.minX + 2 * pad, box.maxY - box.minY + 2 * pad]
  .map((value) => Math.round(value));
const body = offsets.map((offset) =>
  `<g id="o${offset}">${groups.get(offset)!.map((d) => `<path d="${d}"/>`).join("")}</g>`).join("\n");
writeFileSync("public/maps/time-zones.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox[1]} ${viewBox[2]}">\n${body}\n</svg>\n`);
writeFileSync("data/map-offsets.json", `${JSON.stringify({
  source: `Wikimedia Commons ${FILE} (public domain), revision ${info.timestamp}`,
  viewBox: crop,
  offsets,
}, null, 2)}\n`);
console.log(`${offsets.length} offsets, ${[...groups.values()].flat().length} regions from revision ${info.timestamp}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
