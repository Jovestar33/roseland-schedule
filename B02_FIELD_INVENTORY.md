# B02 existing fields and document controls

Baseline `4d39795`, September 16, 2026. Inventory before integration; validation and actual output artifacts will be recorded separately.

| Surface | Existing fields/behavior | Integration requirements |
|---|---|---|
| Header | Project name; phase; positive day/total days; producer/director/camera; town, latitude/longitude, date; derived call time | Reuse existing editors; metadata remains document data, not a hierarchy move. Verify long text, empty/zero coordinates and retained edits. |
| Grid | Action/Other text, location short name/full address/coordinates, description, notes/status, time in/duration/time out, fixed anchors, done, sunrise/sunset rows | Preserve existing grid and store; verify zero duration, optional values and complete long/multiline output. |
| Sub-locations | Stable ID, location, short name, address, coordinates, description, done | Preserve nested values and print full addresses/descriptions. |
| Contacts | Name/title/phone/email, associated row time/action/location/description | Integrate existing Contact Sheet; formula-safe quoted CSV; no loss of differing contact values during deduplication. |
| Call Sheet | Basecamp, crew parking, nearest hospital, emergency contact, meal notes, safety notes, special instructions, general notes | Integrate existing modal/document; preserve all eight values, multi-page long content, include-contacts toggle, read-only permissions and internal-navigation/auth draft retention. |
| Weather | Sunrise/sunset, C/F high/low, precipitation, code/condition, fetched time, town, no-forecast state | Deterministic fictional location/weather provider seam; refresh/clear and sun rows; no real lookup. Guard stale responses across account, document and location/date changes. |
| Schedule print/PDF | Existing schedule styling, weather/header/grid, long descriptions/notes, addresses, repeating table headings | Isolate authenticated local document from workspace/editor chrome; actual PDFs with empty/ordinary/long fixtures, complete text and rendered-page checks. |
| Contact/Call Sheet print | Existing separate print portals | Reuse layouts; isolate local app chrome, preserve all intended text and paginate safely; actual files and page review. |

No public sharing, CMS redesign, hierarchy policy, external provider call or hosted operation belongs to B02. LIB-01/UI-01 remains open in [LIBRARY_PARITY_ISSUE.md](./LIBRARY_PARITY_ISSUE.md).
