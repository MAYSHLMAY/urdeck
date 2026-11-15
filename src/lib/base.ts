/* Where the server routes (/api/...) live. On the website they are on the same address, so this is empty.
   In the Android app the pages are bundled, so the build sets NEXT_PUBLIC_API_BASE to your deployed site. */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');
export const apiUrl = (p: string) => (p.startsWith('/') ? API_BASE + p : p);

/** The public address of the site, for links you share (the app itself runs on https://localhost). */
export const siteOrigin = () => (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') || (typeof location !== 'undefined' ? location.origin : '');

/** True inside the Android app. */
export const isNative = () => typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
