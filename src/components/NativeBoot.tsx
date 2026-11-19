'use client';
import { useEffect } from 'react';
import { isNative } from '@/lib/base';
import { bgHex } from '@/lib/look';

/** Only does anything inside the Android app: system bars, splash, the back button, and the "feels like an app" CSS hook. */
export function NativeBoot() {
  useEffect(() => {
    if (!isNative()) return;
    const root = document.documentElement; root.classList.add('native');
    let off: (() => void) | undefined, dead = false;
    (async () => {
      try {
        const [{ StatusBar, Style }, { App }, { SplashScreen }] = await Promise.all([import('@capacitor/status-bar'), import('@capacitor/app'), import('@capacitor/splash-screen')]);
        const bars = () => {
          const dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
          const hex = bgHex();
          StatusBar.setOverlaysWebView({ overlay: false }).catch(() => { /* ignore */ });
          StatusBar.setBackgroundColor({ color: hex }).catch(() => { /* ignore */ });
          StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => { /* ignore */ });
        };
        bars(); addEventListener('ud-look', bars);
        const mo = new MutationObserver(bars); mo.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'class'] });
        const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', bars);
        // hardware back: close an open dialog, then go back a page, and leave the app only from the home screen
        const h = await App.addListener('backButton', () => {
          const d = document.querySelector('dialog[open]') as HTMLDialogElement | null;
          if (d) { d.close(); return; }
          const path = location.pathname.replace(/\/$/, '') || '/';
          if (path === '/' || history.length <= 1) App.exitApp(); else history.back();
        });
        off = () => { h.remove(); mo.disconnect(); mq.removeEventListener('change', bars); };
        if (dead) off();
        requestAnimationFrame(() => setTimeout(() => SplashScreen.hide({ fadeOutDuration: 180 }).catch(() => { /* ignore */ }), 120));
      } catch { /* plugins missing: the web version still works */ }
    })();
    return () => { dead = true; off?.(); };
  }, []);
  return null;
}
