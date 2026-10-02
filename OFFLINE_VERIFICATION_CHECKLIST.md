# Offline Verification Test Suite - Complete Checklist

**Date:** 2026-10-02  
**Branch:** layout-optimizations  
**11 Recent Fixes Verified:** ✓ All included  
**Test Environment:** Browser DevTools Offline Mode

---

## Quick Start: How to Test

### Setup (Choose One Method)
- **Method A (Easiest):** Chrome/Firefox DevTools → Network tab → Check "Offline" ☑️
- **Method B:** Disconnect WiFi/unplug ethernet
- **Method C:** Open DevTools → Disconnect from server (kill npm server)

### Timeline
- Phase 1-8: ~30 minutes
- Scenario tests: ~45 minutes  
- Total: ~75 minutes

---

## PHASE 1: App Initialization (Offline)

**Setup:** Enable offline mode BEFORE opening app (or disable network)

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **1.1 App loads offline** | 1. Offline mode ON<br>2. Open app (browser cache) | App fully loads, no errors | ☐ | Should load from cache |
| **1.2 No console errors** | 1. Open DevTools console<br>2. Check for red errors | Console clean (no red errors) | ☐ | Blue warnings OK |
| **1.3 UI renders** | 1. Check all pages visible<br>2. Pages: Home, Tickets, Search, Inventory, Explore | All pages render correctly | ☐ | Navigation works |
| **1.4 Sample data loads** | 1. Go to Tickets page<br>2. Check for ticket list | ~166 sample tickets visible | ☐ | From localStorage |
| **1.5 No auth errors** | 1. Check Account settings<br>2. No "login required" messages | App works without auth | ☐ | Local mode active |

**Phase 1 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 2: Local Data Operations (Offline)

**Prerequisites:** Complete Phase 1

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **2.1 Create ticket** | 1. Tickets page<br>2. Click "+ New"<br>3. Fill form, save | Ticket appears in list | ☐ | No network call |
| **2.2 Edit ticket** | 1. Click any ticket<br>2. Change title<br>3. Save | Changes persist | ☐ | Form saves locally |
| **2.3 Delete ticket** | 1. Open ticket<br>2. Click trash icon<br>3. Confirm | Ticket moved to deleted | ☐ | Can undo from settings |
| **2.4 Search tickets** | 1. Search page<br>2. Type "production"<br>3. Check results | Tickets filter locally | ☐ | Full-text search works |
| **2.5 View details** | 1. Explore page<br>2. Select ticket<br>3. Scroll details | All fields display | ☐ | Read-only offline |
| **2.6 Add work notes** | 1. Open ticket<br>2. Add work note<br>3. Save | Note appears in list | ☐ | Saves to localStorage |
| **2.7 Add tasks** | 1. Open ticket<br>2. Add universal task<br>3. Mark done | Task created & tracked | ☐ | State persists |
| **2.8 Export CSV** | 1. Home page<br>2. Export as CSV<br>3. File downloads | CSV file created | ☐ | All data included |
| **2.9 Export Excel** | 1. Home page<br>2. Export as Excel<br>3. File downloads | XLSX file created | ☐ | All data included |
| **2.10 Inventory ops** | 1. Inventory page<br>2. Add asset<br>3. Edit stock | Changes persist | ☐ | Offline inventory works |

**Phase 2 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 3: Auth & Account (Offline)

**Prerequisites:** Complete Phases 1-2

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **3.1 Account page loads** | 1. Settings → Account<br>2. Page renders | Account section visible | ☐ | No auth required |
| **3.2 Offline message** | 1. Check sync badge<br>2. Look for offline indicator | Shows "Offline" status | ☐ | Golden badge visible |
| **3.3 Workspace choice** | 1. Account page<br>2. Check workspace display | Shows local workspace | ☐ | No Supabase required |
| **3.4 No auth crash** | 1. Open app offline<br>2. Navigate around<br>3. No "login required" | App doesn't force auth | ☐ | Local-only mode works |
| **3.5 Settings persist** | 1. Change theme/preferences<br>2. Reload page | Settings maintained | ☐ | localStorage persists |

**Phase 3 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 4: Cloud Sync Handling (Offline)

**Prerequisites:** Complete Phases 1-3

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **4.1 Sync badge offline** | 1. Check badge in header<br>2. Look for "Offline" text | Badge shows offline state | ☐ | CSS: `.sync-offline` |
| **4.2 Changes queue** | 1. Create ticket offline<br>2. Check sync state<br>3. No error | Changes saved locally | ☐ | Not sent anywhere |
| **4.3 Sync stops cleanly** | 1. Open app with cloud<br>2. Go offline<br>3. Check for errors | No crash or errors | ☐ | Graceful degradation |
| **4.4 stopSync works** | 1. Watch sync cleanup<br>2. Offline phase activates<br>3. No resource leaks | Sync properly cleaned up | ☐ | New fix verified |
| **4.5 No infinite retry** | 1. Wait 30 seconds<br>2. Check console<br>3. Retry every ~15s | Steady retry (15s intervals) | ☐ | Not hammering server |

**Phase 4 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 5: API Features Degradation (Offline)

**Prerequisites:** Complete Phases 1-4

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **5.1 Gemini API check** | 1. DevTools Network tab<br>2. Look for `/api/check-gemini`<br>3. Should fail | Request fails (no network) | ☐ | Expected offline |
| **5.2 API caching works** | 1. App cached availability<br>2. Gemini availability from storage | Shows cached state | ☐ | `gemini-available` key |
| **5.3 No crash on API fail** | 1. Open Gemini features<br>2. Check console | No errors, graceful fail | ☐ | Fallback to mock |
| **5.4 Mock suggestions work** | 1. Try Gemini features<br>2. If available, shows mock text | Mock data or "unavailable" | ☐ | Fallback active |
| **5.5 No failed-to-fetch warnings** | 1. Check console<br>2. Look for "failed to fetch" | Clean console | ☐ | Network errors handled |

**Phase 5 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 6: CORS & Network Requests (Offline)

**Prerequisites:** Complete Phases 1-5

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **6.1 Origin validation** | 1. DevTools Network (offline ON)<br>2. Any request attempted | CORS properly validated | ☐ | New fix #1-2 |
| **6.2 No CORS blocks** | 1. Try offline operations<br>2. No CORS errors | No "CORS policy" errors | ☐ | Local requests OK |
| **6.3 Network error detection** | 1. DevTools console<br>2. Check for `looksOffline()` pattern | Errors caught correctly | ☐ | Regex: "failed to fetch" |
| **6.4 Retry activation** | 1. Watch sync state<br>2. Enter "offline" phase<br>3. Retry every 15s | Auto-retry working | ☐ | Exponential backoff? |
| **6.5 No hanging requests** | 1. Wait 60 seconds<br>2. No spinning loaders<br>3. UI responsive | App responsive, no hangs | ☐ | Timeout handling good |

**Phase 6 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 7: Storage & Persistence (Offline)

**Prerequisites:** Complete Phases 1-6

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **7.1 localStorage keys** | 1. DevTools → Application → localStorage<br>2. Check all keys present | All 4 tables exist:<br>- `it-ticket-kanban-v1`<br>- `it-ticket-kanban-deleted-v1`<br>- `it-ticket-kanban-assets-v1`<br>- `it-ticket-kanban-stock-v1` | ☐ | Data tables present |
| **7.2 Auth keys** | 1. Check localStorage<br>2. Look for auth keys | `auth_token` and `auth_user` present (if logged in) | ☐ | JWT fallback available |
| **7.3 Gemini cache** | 1. Check localStorage<br>2. Look for `gemini-available` | Key present with true/false | ☐ | API cache working |
| **7.4 Page reload** | 1. Offline mode ON<br>2. Reload page (Ctrl+R)<br>3. Check data | All data restored | ☐ | localStorage survives |
| **7.5 Browser restart** | 1. Close all tabs<br>2. Reopen app URL<br>3. Check data | All data still there | ☐ | localStorage persistent |
| **7.6 Storage quota** | 1. DevTools → Application<br>2. Check storage size | < 5MB used (safe limit) | ☐ | No quota exceeded |
| **7.7 Backup/restore** | 1. Settings → Backup<br>2. Download backup<br>3. Check file | JSON file downloaded | ☐ | Backup works offline |

**Phase 7 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 8: UI & Console Health (Offline)

**Prerequisites:** Complete Phases 1-7

| Test | Steps | Expected Result | Status | Notes |
|------|-------|-----------------|--------|-------|
| **8.1 No React warnings** | 1. DevTools console<br>2. Look for yellow warnings | No React warnings | ☐ | `useState`, `useEffect` OK |
| **8.2 No unhandled rejections** | 1. Console filter "error"<br>2. Check red errors | No unhandled promise rejections | ☐ | All errors caught |
| **8.3 No setState warnings** | 1. Console search "setState"<br>2. Look for unmounted warnings | No "setState on unmounted" | ☐ | Memory leak fix #11 |
| **8.4 Dark mode works** | 1. Settings → Dark mode toggle<br>2. Toggle on/off | Theme switches, persists | ☐ | UI responsive |
| **8.5 Keyboard nav** | 1. Tab through UI<br>2. Try keyboard shortcuts | Navigation works | ☐ | Accessibility OK |
| **8.6 All pages render** | 1. Visit each page:<br>   - Home, Tickets, Explore, Search, Inventory | All pages load without errors | ☐ | No 404 or blank pages |
| **8.7 No memory leaks** | 1. DevTools Memory<br>2. Take heap snapshot<br>3. Open/close modals many times<br>4. Take another snapshot | Heap size stable | ☐ | Fix #11 verified |

**Phase 8 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 9: Scenario Tests (Complex Workflows)

### Scenario A: Complete Offline Workflow

**Duration:** ~15 minutes  
**Objective:** Full app usage while completely offline

| Step | Action | Expected | Status |
|------|--------|----------|--------|
| 1 | Turn offline mode ON (DevTools or network) | App still runs | ☐ |
| 2 | Open app (from cache) | Full UI loads | ☐ |
| 3 | Create ticket "Test Offline" | Ticket appears in list | ☐ |
| 4 | Edit title to "Test Offline (Modified)" | Change saves | ☐ |
| 5 | Add work note "This is offline" | Note appears | ☐ |
| 6 | Add asset to inventory | Asset created | ☐ |
| 7 | Search for "offline" | Results filter in real-time | ☐ |
| 8 | Export as CSV | File downloads | ☐ |
| 9 | Refresh page (Ctrl+R) | All data still there | ☐ |
| 10 | Switch pages 5 times | Navigation smooth | ☐ |
| 11 | Turn offline mode OFF (restore network) | Sync badge changes | ☐ |
| 12 | Wait 15 seconds | Sync resumes (if cloud available) | ☐ |
| 13 | Check cloud for "Test Offline" ticket | New ticket synced (if cloud available) | ☐ |

**Scenario A Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

### Scenario B: Server Offline (Browser Online)

**Duration:** ~10 minutes  
**Objective:** Verify sync error handling when server dies

| Step | Action | Expected | Status |
|------|--------|----------|--------|
| 1 | App running normally (with sync) | Sync badge green | ☐ |
| 2 | Kill server: `npm stop` (in different terminal) | Sync stops, badge changes | ☐ |
| 3 | Create ticket "Server Down Test" | Saved locally, not sent | ☐ |
| 4 | Wait 30 seconds | Retry attempts shown in console | ☐ |
| 5 | Sync badge shows "offline" or error | Error state visible | ☐ |
| 6 | Restart server: `npm start` | Sync resumes | ☐ |
| 7 | Check if ticket synced up | "Server Down Test" appears on cloud | ☐ |
| 8 | Verify no crashes during restart | App stable | ☐ |

**Scenario B Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

### Scenario C: Supabase Offline (Server OK, No Cloud)

**Duration:** ~10 minutes  
**Objective:** Verify local-only mode when cloud unavailable

| Step | Action | Expected | Status |
|------|--------|----------|--------|
| 1 | DevTools → Network → Block supabase.com | Supabase requests blocked | ☐ |
| 2 | Reload app | Loads in local-only mode | ☐ |
| 3 | Create ticket "Local Only Test" | Ticket appears locally | ☐ |
| 4 | Check Account settings | No auth errors | ☐ |
| 5 | Check sync badge | Shows "offline" or "error" | ☐ |
| 6 | All operations work (CRUD, search, export) | Full functionality | ☐ |
| 7 | Unblock supabase.com | Requests allowed again | ☐ |
| 8 | Sync resumes | Badge changes to green | ☐ |
| 9 | "Local Only Test" ticket synced | Appears in cloud | ☐ |

**Scenario C Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

### Scenario D: Rapid Online/Offline Toggling

**Duration:** ~10 minutes  
**Objective:** Test sync stability with frequent connection changes

| Step | Action | Expected | Status |
|------|--------|----------|--------|
| 1 | Start online, create ticket | Syncs normally | ☐ |
| 2 | Go offline | Sync stops | ☐ |
| 3 | Create ticket while offline | Queued locally | ☐ |
| 4 | Go online | Sync resumes | ☐ |
| 5 | Toggle offline/online 5 times rapidly | No crashes, data preserved | ☐ |
| 6 | All queued changes eventually sync | Cloud catches up | ☐ |
| 7 | No duplicates or data loss | Integrity maintained | ☐ |

**Scenario D Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## PHASE 10: Memory Leak Check (Fix #11)

**Duration:** ~15 minutes  
**Objective:** Verify mounted flag prevents memory leaks

| Step | Action | Expected | Status |
|------|--------|----------|--------|
| 1 | DevTools → Memory tab | Ready | ☐ |
| 2 | Take heap snapshot (baseline) | Baseline recorded | ☐ |
| 3 | Open Gemini feature repeatedly 20 times | API checks fire | ☐ |
| 4 | Close features 20 times | Cleanups run | ☐ |
| 5 | Take heap snapshot again | Heap size similar to baseline | ☐ |
| 6 | No "setState on unmounted" warnings | Console clean | ☐ |
| 7 | Component cleanup runs properly | No dangling timers | ☐ |

**Phase 10 Status:** ☐ PASS / ☐ FAIL  
**Notes:** 

---

## Summary Report

### Overall Status
- ☐ All phases PASSED
- ☐ All scenarios PASSED  
- ☐ Ready for production

### Failures Found
```
Phase:
Issue:
Impact:
Fix needed:
```

### Console Errors/Warnings
```
[List any errors, even if not blocking]
```

### Performance Notes
```
[Offline performance observations]
[Memory usage]
[Storage usage]
```

### Sign-Off
- Tester Name: _______________
- Date: _______________
- Environment: [Browser/OS]
- Branch: layout-optimizations
- All 11 fixes verified: ☐ YES / ☐ NO

---

## Quick Reference: All 11 Fixes Tested

| # | Fix | Offline Impact | Status |
|---|-----|-----------------|--------|
| 1-2 | CORS validation | Stricter origin checking | ☐ |
| 3 | Auth bypass removed | Local auth still works | ☐ |
| 4 | Hardcoded defaults removed | Initializes without Supabase | ☐ |
| 5 | Sync cleanup added | Cleanup on logout/unmount | ☐ |
| 6 | Dependency array fixed | Proper effect re-runs | ☐ |
| 7 | Effect cleanup logic | Cleanup runs when sync active | ☐ |
| 8 | Unused ref removed | Clean code | ☐ |
| 9 | Memory leak fix (Gemini) | Mounted flag prevents leaks | ☐ |
| 10-11 | [Reserved] | | ☐ |

