/* Free-form simulations: any HTML page (2D canvas, SVG, DOM, three.js...) or a bare three.js script. They run in a sandboxed iframe
   with their own buttons and UI, so nothing about them is restricted by the lab's own model format. */

const SIM = /^\s*(\/\*\s*flight-recall-sim\b|<!--\s*flight-recall-sim|<!doctype\s+html|<html|<head|<body|<script|<canvas|<div|<style|<svg)/i;
export const isSim = (code: string) => SIM.test(code || '');
export const isHtml = (code: string) => /^\s*(<!doctype|<html|<head|<body|<script|<canvas|<div|<style|<svg|<!--)/i.test(code || '');
export const is3d = (code: string) => /THREE\b|webgl|three(\.module)?\.(min\.)?js|WebGLRenderer/i.test(code || '');

// Title for a simulation: the <title> tag, or a "flight-recall-sim: Name" marker comment
export function simTitle(code: string, fallback = 'Simulation') {
  const t = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(code) || /flight-recall-sim\s*:\s*([^*\n]{1,120})/i.exec(code);
  return t ? t[1].trim() : fallback;
}

const BASE = 'html,body{margin:0;height:100%;overflow:hidden;font-family:system-ui,sans-serif}canvas{display:block}';

/** The document the iframe shows. */
export function simDoc(code: string, origin: string): string {
  const V = origin + '/vendor/three/';
  const classic = `<script src="${V}three.min.js"></script><script src="${V}js/controls/OrbitControls.js"></script>`;
  const map = `<script type="importmap">{"imports":{"three":"${V}three.module.js","three/examples/jsm/":"${V}jsm/","three/addons/":"${V}jsm/"}}</script>`;
  if (isHtml(code)) {
    let d = code;
    const needs = is3d(code) && !/<script[^>]+src=["'][^"']*three/i.test(code) && !/importmap/i.test(code) && !/\bimport\b[^;]*from\s*["']three/.test(code);
    const inject = (needs ? classic : '') + `<style>${BASE}</style>`;
    if (/<head[^>]*>/i.test(d)) d = d.replace(/<head[^>]*>/i, m => m + inject);
    else if (/<html[^>]*>/i.test(d)) d = d.replace(/<html[^>]*>/i, m => m + '<head>' + inject + '</head>');
    else d = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + inject + '</head><body>' + d + '</body></html>';
    return d;
  }
  const mod = /^\s*import\s|\n\s*import\s[^(]/.test(code);
  const err = `window.addEventListener('error',function(e){var p=document.createElement('pre');p.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;margin:0;padding:10px;background:#fee;color:#900;font:12px monospace;white-space:pre-wrap;z-index:9';p.textContent=String(e.message);document.body.appendChild(p)})`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE}</style>${mod ? map : classic}<script>${err}</script></head><body><script${mod ? ' type="module"' : ''}>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script></body></html>`;
}
