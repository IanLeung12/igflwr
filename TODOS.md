# TODOs & improvements

## High priority

### Tab visibility handling
The scraper uses `setTimeout` for delays. Chrome throttles background tabs (≥1000ms after ~5min → 1 tick/min). If user tabs out during a long scrape, it effectively freezes.
**Fix**: Listen to `document.visibilitychange`, pause/resume the scroll loop. Or use `chrome.tabs` API.

### Pagination cap for large accounts
Users with 10k+ followers/following will take ~5 hours at 1.8s/scroll. The 200-iteration cap may not be enough.
**Fix**: Remove iteration cap entirely, rely only on stall detection. Or add an adaptive scroll speed that accelerates when no dialog interaction is needed.

### CSRF token refresh
The `api.ts` reads `csrftoken` from cookies once. Instagram tokens expire. If the queue processes actions for >10min, actions may fail with stale tokens.
**Fix**: Re-read `csrftoken` from cookies before each API call, not once.

### Error recovery in action queue
If `apiFollow`/`apiUnfollow` fails due to network blip, the action is marked `failed` and skipped. The remaining queue still processes, but there's no retry logic.
**Fix**: Add retry (e.g., 3 attempts with backoff) before marking as `failed`.

## Medium priority

### Background-tab throttle workaround
Replace `setTimeout`-based sleeps with `requestAnimationFrame` + elapsed-time tracking when the tab is visible, and use `chrome.alarms` API (or `setInterval` throttled) when hidden. This ensures progress even in background.

### Data completeness heuristics
`checkDataCompleteness` warns on `|followers - following| > 1000`. This fires a false positive for accounts that genuinely follow far more than their follower count.
**Fix**: Also check against the displayed follower/following count from the profile page header.

### Batch action confirmation
"Batch unfollow all not_following_back" has no confirmation dialog. One misclick can unfollow 100+ people.
**Fix**: Add a modal showing the count + first 5 usernames, with a confirm/cancel.

### Anti-detection measures
Fast sequential actions (current delay: 3s default) may trigger Instagram's rate limiting.
**Fix**: Add jitter (±30% of delay), human-like random pauses, and detect `feedback_required` responses to back off.

### Sidebar resizing
The sidebar is fixed at 380px. Users with many users may want a wider view.
**Fix**: Make the sidebar width adjustable with a drag handle, persist to storage.

## Low priority

### Export data
No way to export followers/following lists to CSV/JSON.
**Add**: Export button in the ActionBar.

### Search by status
Search only matches username/fullName. Cannot filter "all mutuals whose name contains 'john'".
**Fix**: Let filter tabs and search compose: `activeFilter` + `searchQuery` work together.

### User caching between scrapes
`saveFollowers`/`saveFollowing` overwrites storage entirely on each scrape. If scrape 1 gets 500 followers and scrape 2 gets 450 (different time), the 50 missing users are lost.
**Fix**: Union-merge with existing data, or keep timestamps per user.

### Avatar caching for offline display
Avatars are stored as URLs. If the user is offline or Instagram blocks the request, all avatars show as gray circles.
**Fix**: Use `fetch` + `URL.createObjectURL` to cache avatars in extension storage.

### Accessibility
- No keyboard navigation in the user list.
- No ARIA labels on buttons or status indicators.
- Color-only status indicators (mutual=green, not_following_back=red) — needs icon/text for colorblind users.
