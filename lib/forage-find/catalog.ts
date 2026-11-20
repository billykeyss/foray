/** The findable species profiles over the bundled catalog. Pages and the chat tool import this;
 *  components receive profiles as props (they never import the catalog). */
import { PNW_CATALOG } from "../species-catalog.ts";
import { findableProfiles, type HabitatProfile } from "./profiles.ts";

export const FINDABLE_PROFILES: HabitatProfile[] = findableProfiles(PNW_CATALOG);
export const FINDABLE_IDS = new Set(FINDABLE_PROFILES.map((p) => p.id));
