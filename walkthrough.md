# Walkthrough — Environment-Aware Reconciliation (Phase C)

All changes to make the Reconciliation and Caching system environment-aware and robust against JSON parsing errors have been completed, verified, and tested successfully.

## 1. JSON Parse Error Fixes (Part 1)
- **Problem**: When a request to Bubble or the Node server returns HTML instead of JSON (like 404, 500, or a redirect), `res.json()` throws a SyntaxError (`Unexpected token '<'`), breaking the UI rendering.
- **Solution**: 
  - Updated `downloadBubbleCache` and `fetchLiveCounts` in [server.js](file:///d:/Antigravity/LPFF%20Sync%201/server.js) to inspect the `Content-Type` header of Bubble responses. If it's not `application/json`, it throws a clean error: `"Bubble API returned non-JSON — check environment config/credentials"`.
  - Updated the frontend data loaders (`loadLiveDashboard` and `pollReconciliationStatus` in [dashboard.html](file:///d:/Antigravity/LPFF%20Sync%201/dashboard.html)) to verify both `res.ok` and the `Content-Type` before parsing JSON. Non-JSON responses fail gracefully and show a descriptive error card in the table body (e.g. `Server returned non-JSON (404)`).

## 2. Environment-Aware Caching & Namespacing (Part 2)
- **Token & Base URL**: Implemented `getBubbleCredentials(isProduction)` to dynamically resolve the Bubble token and base URL based on the request's environment (`x-environment` header or sync function flags) rather than relying on a global boot-time configuration.
- **File Namespacing**: 
  - Suffixes all stats and cache files with `.dev.json` or `.prod.json` based on the target environment:
    - **Stats**: `stats_<tableId>.<dev|prod>.json` (e.g., [stats_firms.dev.json](file:///d:/Antigravity/LPFF%20Sync%201/stats_firms.dev.json) vs [stats_firms.prod.json](file:///d:/Antigravity/LPFF%20Sync%201/stats_firms.prod.json)).
    - **Cache**: `.cache_lpff.<tableName>.view.<dev|prod>.json`.
  - Updated `runSingleTableReconciliation` to maintain separate lock states per environment (`lockKey = id_env`), allowing DEV and PROD checks to run independently without clashing.
- **Counts Cache**: Namespaced `LIVE_COUNTS_CACHE` into `LIVE_COUNTS_CACHE.dev` and `LIVE_COUNTS_CACHE.prod` so DEV and PROD counts are cached separately. Switching environments automatically reads from the correct cache.

## 3. UI Environment Indicator & Page-Level Toggle
- Replaced the static environment banner in the "Data Status" transparency note card with an **interactive, page-level DEV/PROD environment toggle**:
  - Highlights the active environment in **Amber/Orange** (for DEV) or **Green** (for PROD) with modern pill styles.
  - Clicking `DEV` or `PROD` on the dashboard page triggers `switchEnvironment(env)`, reloading the cached namespaced counts and stats instantly without requiring a full reconciliation run.
  - Automatically synchronizes with the top navigation environment badge and Settings fields so all controls remain in perfect sync.
  - Selected environment persists across page refreshes via `localStorage`.

## 4. Startup Migration & Backfilling
- Added a startup routine `migrateLegacyFiles()` in [server.js](file:///d:/Antigravity/LPFF%20Sync%201/server.js).
- When the server boots, it scans for any non-environment-tagged `stats_*.json` and `.cache_*.json` files. If they exist without tag suffixes, it safely copies/backfills them to `.prod.json` files since we confirmed they reflect production data.

---

### Verification and Screenshots

#### Page-Level Bubble Environment Toggle (PROD Mode Active)
![Page-Level Environment Toggle](reconciliation_docs/dashboard_prod_mode.png)

#### Completed Reconciliation in PROD Mode
![PROD Reconciliation Complete](reconciliation_docs/prod_reconciliation_complete_1786603966753.png)

#### Live Verification Video
The browser session video demonstrating page-level toggling between DEV/PROD, immediate update of the topbar badge, instant reload of namespaced stats/counts, and persistence across refreshes is saved at:
![Live Verification Recording](reconciliation_docs/verify_env_awareness_1786603559100.webp)

## 5. Comparator Alignment & Health Thresholds Retuning
- **Employment History Field-Mismatch Fix**:
  - **Problem**: Mismatch count was ~98% (`348,439` records) due to camelCase property references (`practitioner_number`/`firm_number`/`inactive`) that did not exist on raw Bubble records.
  - **Solution**: Changed properties to their correct space-separated and capitalized Bubble keys (`'Practitioner Number'`, `'Firm Number'`, `'Inactive'`). Field mismatches dropped instantly to **`1,793`** (~0.5%).
- **Other Tables' Comparator Alignments**:
  - **Firms/Practitioners/Audits**: Standardized status check to match `'Inactive Flag'` (or `'inactiveflag'`).
  - **Practitioners Admissions**: Resolved a spelling variation where Conveyancer is stored as `'Conveyencer'` (with an `e`) in Bubble.
  - **Banks Key Mapping & Status Inversion**:
    - Mapped `firm_number` $\rightarrow$ `'Allocated Firm Number'` in Bubble.
    - Resolved a status inversion where `"Active"` (meaning NOT inactive, i.e. `inactive = false`) was parsed by `normalizeBoolean` as `true` (meaning inactive), causing 107,257 false positive mismatches.
    - Implemented a custom status parser for bank accounts. Bank mismatches dropped to **`55,705`**, with 99.99% (`55,703` records) confirmed as the "SQL firm set, Bubble blank" historical delta case (no logic bugs remain).
- **Option 2 Health Thresholds**:
  - Implemented the user-approved Option 2 bands for missing records:
    - 🟢 **Healthy**: $\le 1.5\%$ missing records
    - 🟡 **Warning**: $> 1.5\%$ and $\le 5.0\%$ missing records
    - 🔴 **Critical**: $> 5.0\%$ missing records
  - Updated the health computation logic in [server.js](file:///d:/Antigravity/LPFF%20Sync%201/server.js) and the threshold status helper tooltips in [dashboard.html](file:///d:/Antigravity/LPFF%20Sync%201/dashboard.html).
  - Quiet database noise is now classified as **Warning** (Firms, Practitioners, Employment History, Audits), while major discrepancies (Banks, Applications, Certificates) are flagged as **Critical**.

## 6. SQL Data Integrity Rules & Banks Manual Backfill
- **Practitioners Admissions Scoping**: Narrowed the practitioners admission check rule to target only active Practising Members (`Aff_StatusLkp = 1 AND Aff_LegalPractitionerTypeLkp = 1108`) with zero admission flags, dropping the anomaly count from `17,295` to exactly **`410`**.
- **New Bank Account Integrity Rule**: Integrated a new SQL Data Integrity rule to flag `"Active Account with missing Account Number"` (matching active open accounts in SQL where the account number is empty). This rule flags **`6,882`** records in production, which are displayed on the dashboard for human review alongside the existing firm-link rules.
- **One-Time Manual Backfill**:
  - Sequentially processed and successfully backfilled **`1,177`** active, valid-account-number records that were missing in Bubble.
  * **Success Rate**: **`100%`** (1,177 attempted, 1,177 succeeded, 0 errors).
  * **Duration**: **`224.34 seconds`** (~190ms per record including API delay).
  * **Reconciliation Impact**: Triggered a fresh reconciliation run (after deleting the stale Bubble cache to force downloading the new live dataset). Verified that the **"Missing in Bubble"** count for bank accounts dropped from **`8,831`** to **`7,314`**.

### Integrity & Dashboard Verification
- **Screenshot showing the new SQL Data Integrity counts and the updated Banks counts**:
  ![Banks SQL Data Integrity & Backfilled Counts](file:///C:/Users/Nathan/.gemini/antigravity-ide/brain/5faac778-161e-4e59-bcf1-3921274a31f4/banks_integrity_rules_1786627351737.png)
- **Interactive Verification Video**:
  ![Live Dashboard Video Verification](file:///C:/Users/Nathan/.gemini/antigravity-ide/brain/5faac778-161e-4e59-bcf1-3921274a31f4/verify_recon_dashboard_1786627244610.webp)


