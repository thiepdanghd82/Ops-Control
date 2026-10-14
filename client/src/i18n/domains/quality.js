/**
 * Quality domain i18n (v1.6, wave 2).
 *
 * SAP-QM analogue. Owns Sample Tracking, which CCL Vietnam scopes under
 * Quality rather than Sales — a convention sales.js has documented since v1.3
 * H2 ("sample tracking (`sample.*`) sits in quality.js") without the file
 * existing yet. It does now.
 *
 * Vocabulary this screen SHARES with RFQ Tracker lives in sales.js as
 * `track.*`, not here: the two screens are near-twins and duplicating 44 keys
 * so each domain owns its own copy would guarantee they drift apart.
 *
 * Industry acronyms stay in EN per the strings.js convention — CS, NPI, IFS,
 * KPI, and the sample verdicts OK / NG / PARTIAL, which operators write on the
 * physical sample tags in English.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // People + ownership. CS and NPI are department names, kept as operators say
  // them; only the surrounding words are translated.
  // Part + order identity. "Part No." keeps the IFS field name it mirrors, the
  // same call made for the inventory import canonicals.
  // Stage + schedule.
  // Verdicts. OK / NG / PARTIAL stay in EN — they are written on the physical
  // sample tag and read back from it, so translating the button would break the
  // match between screen and paper.
});
