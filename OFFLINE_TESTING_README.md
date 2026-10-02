# Offline Functionality Testing Guide

**Branch:** layout-optimizations  
**Date:** 2026-10-02  
**Total Tests:** 90+  
**Estimated Time:** 2-3 hours (all phases + scenarios)  

---

## Quick Start (5 min)

### Setup
```bash
# 1. Ensure branch is clean
git status

# 2. Start the app (one terminal)
npm install
npm run dev

# 3. Open browser
open http://localhost:5173

# 4. Enable offline mode
DevTools (F12) → Network tab → Check "Offline" ☑️
```

### Quick Test (Phase 1)
```
1. Offline mode ON
2. Refresh page (Ctrl+R)
3. Check if app loads from cache
4. Go to Tickets page
5. Verify ~166 sample tickets visible
6. Check browser console for errors
7. Offline mode OFF
```

**Expected Result:** App fully functional, no errors  
**Time:** 2 minutes

---

## Full Testing Guide

### What You're Testing
✅ **All 11 recent bug fixes work in offline mode**
✅ **App data persists without network**
✅ **Cloud sync gracefully degrades**
✅ **No console errors or React warnings**
✅ **Memory doesn't leak**
✅ **CORS changes don't break anything**

### Why This Matters
- App is designed for **offline-first operation**
- Users can work offline and sync when connected
- Security fixes shouldn't break offline functionality
- This is a critical verification step before production merge

---

## Testing Phases (Choose Your Path)

### Path A: Quick Verification (30 min)
Best for: Smoke test before merge
- Run Phases 1, 2, 8
- Run Scenario A only
- Do Phase 10 (memory check)
- **Success = Minimal verification complete**

### Path B: Standard Testing (75 min)
Best for: Regular development verification
- Run all Phases 1-8
- Run all Scenarios A-D
- Do Phase 10
- **Success = Production-ready verification**

### Path C: Comprehensive Testing (3 hours)
Best for: Pre-release verification
- Run all Phases 1-10 twice (different browsers)
- Run all Scenarios A-D twice
- Load test with 1000+ items
- Test on mobile browsers
- **Success = Maximum confidence**

---

## Phase-by-Phase Guide

### Phase 1: App Initialization (5 min)
**Objective:** Verify app loads without network

**Steps:**
1. Offline mode OFF (normal network)
2. Open app normally
3. Turn offline mode ON
4. Refresh page (Ctrl+R)
5. Verify UI loads from cache
6. Check browser console (F12) for red errors

**What to Look For:**
- ✅ Page renders completely
- ✅ No 404 or blank screen
- ✅ All UI elements visible
- ✅ Console clean (no red errors)

**If Failed:**
- Check if browser cache enabled
- Try hard refresh: Ctrl+Shift+R
- Check Network tab → disable cache is OFF

---

### Phase 2: Local Data Operations (20 min)
**Objective:** Verify data CRUD works offline

**Steps:**
1. Offline mode ON
2. Navigate to Tickets page
3. Click "+ New" to create ticket
4. Fill form with test data
5. Click Save
6. Verify ticket appears in list
7. Click ticket to open
8. Edit title, save
9. Try search function
10. Try export to CSV

**What to Look For:**
- ✅ Create succeeds without network call
- ✅ Edit persists changes immediately
- ✅ Search filters in real-time
- ✅ No "failed to fetch" errors
- ✅ Export file downloads

**If Failed:**
- Check localStorage has data (Application tab)
- Check console for specific errors
- Verify offline mode is still ON

---

### Phase 3: Auth & Account (5 min)
**Objective:** Verify auth doesn't crash offline

**Steps:**
1. Offline mode ON
2. Open Settings → Account
3. Look for offline indicator
4. Check no "login required" message
5. Verify settings still work

**What to Look For:**
- ✅ Account page loads
- ✅ Shows "Offline" status
- ✅ No auth errors
- ✅ No forced redirect to login

**If Failed:**
- Auth system crashing offline = CRITICAL
- Check console for specific error
- Verify auth initialization in AuthContext.tsx

---

### Phase 4: Cloud Sync Handling (10 min)
**Objective:** Verify sync gracefully stops

**Steps:**
1. Offline mode ON
2. Look at sync badge (top right area)
3. Should show "Offline" message
4. Create a ticket
5. Watch sync badge
6. Offline mode OFF (restore network)
7. Watch badge change back

**What to Look For:**
- ✅ Badge shows "Offline" state
- ✅ No sync attempts (no "Syncing..." spam)
- ✅ Retry every ~15 seconds (watch console)
- ✅ No crashing when going offline
- ✅ Smooth transition when going online

**If Failed:**
- Sync hammer/infinite loop = CRITICAL
- Check cloudSync.ts retry logic
- Verify stopSync() is being called

---

### Phase 5: API Features Degradation (10 min)
**Objective:** Verify Gemini API fails gracefully

**Steps:**
1. Offline mode ON
2. Look for Gemini-powered features
3. Try to use AI suggestions (if available)
4. Check console → Network tab
5. Look for /api/check-gemini request
6. Should fail with no network
7. Should not crash the app

**What to Look For:**
- ✅ No "failed to fetch" warning in console
- ✅ Gemini features show "unavailable" gracefully
- ✅ App doesn't crash from API failure
- ✅ No infinite retry loops

**If Failed:**
- Unhandled API error = Issue
- Check useGemini.ts error handling
- Verify try-catch blocks in place

---

### Phase 6: CORS & Network Requests (10 min)
**Objective:** Verify CORS fix doesn't break offline

**Steps:**
1. Offline mode ON
2. DevTools → Network tab
3. Try any operation (create ticket, search, etc.)
4. Network tab should stay empty (no requests attempted)
5. Check console for "CORS" errors
6. Should have none

**What to Look For:**
- ✅ No CORS policy errors
- ✅ No "failed to fetch" warnings
- ✅ All operations work locally
- ✅ Proper origin validation if any requests attempted

**If Failed:**
- CORS error means origin validation too strict
- Check check-gemini.ts CORS logic
- Verify origin header validation is correct

---

### Phase 7: Storage & Persistence (10 min)
**Objective:** Verify data survives restarts

**Steps:**
1. Offline mode ON
2. DevTools → Application → Storage → localStorage
3. Look for these keys (must all exist):
   - `it-ticket-kanban-v1` (tickets)
   - `it-ticket-kanban-deleted-v1` (deleted)
   - `it-ticket-kanban-assets-v1` (assets)
   - `it-ticket-kanban-stock-v1` (stock)
4. Create new ticket
5. Close DevTools
6. Refresh page (Ctrl+R)
7. Verify ticket still there

**What to Look For:**
- ✅ All 4 data tables in localStorage
- ✅ Data size < 5MB (storage quota OK)
- ✅ Data survives page reload
- ✅ No "quota exceeded" errors

**If Failed:**
- Storage quota exceeded = Need to compress data
- localStorage not persisting = Browser setting issue
- Check backup.ts for data table names

---

### Phase 8: UI & Console Health (10 min)
**Objective:** Verify no memory leaks or React warnings

**Steps:**
1. Offline mode ON
2. DevTools → Console tab
3. Filter for errors (red) and warnings (yellow)
4. Navigate through all pages multiple times
5. Create/edit/delete tickets repeatedly
6. Watch for warnings like "setState on unmounted"
7. Memory tab → take heap snapshot, do operations, take another

**What to Look For:**
- ✅ No React warnings
- ✅ No "setState on unmounted" messages
- ✅ No unhandled promise rejections
- ✅ Heap size stable (not growing)

**If Failed:**
- React warnings = State management issue
- Memory growing = Memory leak (check fix #11)
- Unhandled errors = Error handling missing

---

### Phase 9: Scenario Tests (45 min total)

#### Scenario A: Complete Offline Workflow (15 min)
**Objective:** Full app workflow without network

```
Timeline:
1. Start: Network available
2. Turn offline
3. Do full workflow (create, edit, search, export)
4. Turn online
5. Verify sync resumes
```

**Detailed Steps:**
```javascript
// Step 1: Turn offline
DevTools → Network → Offline ✓

// Step 2: Open app (from cache)
Refresh page

// Step 3: Full workflow
1. Create ticket "Test Offline"
2. Edit title to "Test Offline (Modified)"  
3. Add work note "Testing offline"
4. Add universal task "Verify sync"
5. Search for "offline"
6. Export as CSV
7. Reload page (Ctrl+R) - verify data still there
8. Switch between pages multiple times

// Step 4: Turn online
DevTools → Network → Offline ☐ (uncheck)

// Step 5: Wait for sync
Watch sync badge (top right)
Should show syncing, then synced
```

**Success Criteria:**
- All operations complete without errors
- Data persists across reload
- Sync resumes when online
- No crashes or console errors

**Failure = CRITICAL - Must fix before merge**

---

#### Scenario B: Server Offline (10 min)
**Objective:** Handle server being down

```
Timeline:
1. App running normally
2. Kill server
3. App continues working locally
4. Restart server
5. Sync resumes
```

**How to Test:**
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: When ready, stop server
Ctrl+C

# Terminal 1: Restart server when done
npm run dev
```

**What to Watch:**
- App doesn't crash when server dies
- Sync badge shows "error" or "offline"
- Can still do all local operations
- Sync resumes automatically when server restarts

---

#### Scenario C: Supabase Offline (10 min)
**Objective:** Handle cloud being unavailable

```
DevTools → Network → Block Domain
Block: supabase.com
```

**What to Verify:**
- App initializes without Supabase
- No auth errors
- All local operations work
- Unblock supabase.com
- Sync resumes

---

#### Scenario D: Rapid Toggle (10 min)
**Objective:** Stability under connection flapping

```
Do 10 times:
1. Offline ON (5 sec)
2. Offline OFF (5 sec)
3. Offline ON (5 sec)
4. Offline OFF (5 sec)
```

**Watch For:**
- No crashes
- No data corruption
- Data eventually syncs (if cloud available)
- No "double sync" or duplication

---

### Phase 10: Memory Leak Check (15 min)
**Objective:** Verify fix #11 (mounted flag) works

**Steps:**
1. DevTools → Memory tab
2. Take heap snapshot (baseline)
3. Open Gemini API feature area
4. Repeatedly:
   - Open feature
   - Close feature
   - Repeat 20 times
5. Take heap snapshot again
6. Compare baseline vs final

**What to Look For:**
- ✅ Heap size similar (within 5MB)
- ✅ No "setState on unmounted" warnings
- ✅ No detached DOM nodes growing

**If Failed:**
- Memory leak = Fix #11 not working
- Check useGemini.ts mounted flag
- Verify cleanup function running

---

## What to Do If Tests Fail

### Critical Failures (Block Release)
These must be fixed before merge:

1. **App won't load offline**
   - Problem: Cache not working or app crashes on load
   - Check: Browser cache enabled, no 404 errors
   - Fix: Clear cache, investigate console errors

2. **Data operations fail offline**
   - Problem: CRUD doesn't work locally
   - Check: localStorage keys exist in Application tab
   - Fix: Verify cloudSync/backup logic

3. **React warnings**
   - Problem: "setState on unmounted" or similar
   - Check: DevTools console for exact warning
   - Fix: Review useEffect cleanup functions

4. **Memory leak**
   - Problem: Heap grows continuously
   - Check: Phase 10 memory comparison
   - Fix: Review mounted flag in useGemini.ts

### Non-Critical Issues (Can Be Fixed Later)
- Cosmetic bugs
- Performance optimizations
- Warning messages (non-blocking)

---

## Success Checklist

Before marking tests complete:

- ☐ All 8 phases passed
- ☐ All 4 scenarios passed
- ☐ Phase 10 (memory) passed
- ☐ No critical failures
- ☐ No React warnings in console
- ☐ No unhandled errors
- ☐ All localStorage keys present
- ☐ Performance acceptable
- ☐ Report completed

---

## Files Created for This Verification

1. **OFFLINE_VERIFICATION_CHECKLIST.md** - Detailed test checklist (this file)
   - Use to track individual test results
   - Check boxes as you complete each test
   - List issues found in each phase

2. **OFFLINE_TEST_REPORT_TEMPLATE.md** - Formal report template
   - Use after all testing complete
   - Document overall results
   - Record any issues and resolutions

3. **OFFLINE_TESTING_README.md** - This guide
   - How to run tests
   - What to look for
   - Troubleshooting tips

---

## Quick Reference: All 11 Fixes

| # | Component | What Changed | Offline Impact |
|---|-----------|-------------|-----------------|
| 1-2 | CORS validation | Stricter origin checking | ✓ Test Phase 6 |
| 3 | Auth bypass | Removed 'local-token' hardcode | ✓ Test Phase 3 |
| 4 | Hardcoded defaults | Removed DEFAULT_USER/TOKEN | ✓ Test Phase 3 |
| 5 | Sync cleanup | Added stopSync on logout | ✓ Test Phase 4 |
| 6 | Dependencies | Fixed user?.id → user | ✓ Test Phase 4 |
| 7 | Cleanup logic | Moved stopSync into cleanup | ✓ Test Phase 4 |
| 8 | Dead code | Removed unused syncStartedRef | ✓ No offline impact |
| 9 | Memory leak | Added mounted flag | ✓ Test Phase 10 |

---

## Need Help?

### Common Issues

**Q: App won't load offline**  
A: DevTools → Network → check if cache is disabled. Try Ctrl+Shift+R hard refresh.

**Q: Getting CORS errors**  
A: This might be intentional (origin validation). Check if request origin is correct.

**Q: "setState on unmounted" warning**  
A: This is fix #11. If still appearing, mounted flag might not be working in useGemini.ts.

**Q: Memory growing**  
A: Check Phase 10. Mounted flag might not be cleaning up properly. Verify useGemini.ts cleanup.

**Q: Sync not resuming when online**  
A: Check if cloudSync.ts has proper "online" event listener. May need browser restart.

---

## Next Steps

1. **Complete all phases** using OFFLINE_VERIFICATION_CHECKLIST.md
2. **Record results** in OFFLINE_TEST_REPORT_TEMPLATE.md
3. **Fix any critical issues** (Phase would show FAIL)
4. **Re-test failed phases**
5. **Approve for merge** when all phases PASS

---

## Questions?

Refer to:
- **Plan file:** `/Users/yuki/.claude/plans/ultrathink-through-this-step-playful-sparrow.md`
- **Code explorer output:** Covers all offline architecture details
- **Git log:** `git log --oneline` shows all 11 fixes

---

**Good luck with testing! 🚀**

The app is built for offline-first operation. These tests verify all recent fixes are compatible with that design.

Generated: 2026-10-02

