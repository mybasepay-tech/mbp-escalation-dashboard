// Backend selection for the v2 UI (Loop 23) — pure, no DOM, no network, no live imports.
//
// MockStore is ALWAYS the default. The SharePoint TEST backend is opt-in only and requires
// BOTH an explicit request (the `?backend=sharepoint-test` query string) AND a server-side,
// git-ignored opt-in config (see liveBackendGate.js) — the UI never connects to SharePoint
// just because runtime files exist, and never falls back silently in either direction:
//   * default / unknown `backend` values -> MockStore (the safe direction; documented);
//   * `backend=sharepoint-test` without the server-side opt-in -> a VISIBLE error, no data.

export const BACKEND = Object.freeze({
  MOCK: 'mock',
  SHAREPOINT_TEST: 'sharepoint-test',
});

/** Query-string key the UI reads: ?backend=sharepoint-test */
export const BACKEND_QUERY_KEY = 'backend';

/** Visible backend indicator text (always shown so the active backend is unambiguous). */
export const INDICATOR_TEXT = Object.freeze({
  [BACKEND.MOCK]: 'Mock backend',
  [BACKEND.SHAREPOINT_TEST]: 'SharePoint test backend',
});

/** Banner shown in mock mode (the long-standing default). */
export const MOCK_BANNER_TEXT =
  'Mock data only — not connected to any live system (no Graph / SharePoint / production).';

/** WARNING banner shown whenever the SharePoint test backend is active. */
export const SHAREPOINT_TEST_WARNING =
  'Test SharePoint backend enabled — non-production only';

/**
 * Decide the requested backend from the page query string. Pure and total:
 * anything other than the exact `sharepoint-test` opt-in value selects MockStore.
 * @param {string} search - window.location.search (may be '' or undefined)
 * @returns {{ mode: string, explicitlyRequested: boolean, ignoredValue: string|null }}
 */
export function selectBackend(search) {
  const params = new URLSearchParams(search ?? '');
  const requested = params.get(BACKEND_QUERY_KEY);
  if (requested === BACKEND.SHAREPOINT_TEST) {
    return { mode: BACKEND.SHAREPOINT_TEST, explicitlyRequested: true, ignoredValue: null };
  }
  return {
    mode: BACKEND.MOCK,
    explicitlyRequested: false,
    // Unknown values fall back to MOCK (which never connects anywhere) — surfaced so the
    // UI can hint at the typo instead of silently doing something unexpected.
    ignoredValue: requested && requested !== BACKEND.MOCK ? requested : null,
  };
}
