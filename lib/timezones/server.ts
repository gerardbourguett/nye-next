import "server-only";
import { supabaseConfig, uncachedFetch } from "../supabase/config";
import { loadCatalog } from "./load-catalog";

export function loadRelayCatalog() {
  return loadCatalog(supabaseConfig(), uncachedFetch);
}
