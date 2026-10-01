import "server-only";
import { connection } from "next/server";
import { editionYear } from "./edition";

/** The edition at request time; never prerendered with a build-time year. */
export async function requestEdition(): Promise<number> {
  await connection();
  return editionYear(Date.now());
}
