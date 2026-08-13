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
