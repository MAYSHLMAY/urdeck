import { apiUrl } from './base';

/* Sends a short technical note to the server when something breaks, so problems are found without waiting for someone to complain.
   It never sends cards, notes, names or sync codes: only the error text, the page path, the app version and the browser. Switch off: localStorage ud-noreport = 1. */
const seen = new Set<string>(); let sent = 0;
const BUILD = process.env.NEXT_PUBLIC_BUILD || '';
/** Errors that are just the phone being offline or a page being closed: not worth a report. */
const NOISE = /Failed to fetch|NetworkError|Load failed|AbortError|The operation was aborted|ResizeObserver|Script error|network error|cancelled|canceled/i;

export function off() { try { return localStorage.getItem('ud-noreport') === '1'; } catch { return false; } }
export function reportError(err: unknown, kind = 'error') {
  try {
    if (typeof window === 'undefined' || off() || sent >= 5) return;
    const e: any = err, m = String((e && (e.message || e.name)) || e || '').slice(0, 300);
    if (!m || NOISE.test(m) || seen.has(m)) return;
    seen.add(m); sent++;
    const body = JSON.stringify({ m, s: String((e && e.stack) || '').replace(/https?:\/\/[^\s)]+\//g, '/'), p: location.pathname, b: BUILD, k: kind });
    const url = apiUrl('/api/log');
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  } catch { /* never throw from the reporter */ }
}
