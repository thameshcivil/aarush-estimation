/* ================= BOOT ================= */
(async function boot() {
  try { await Store.init(); } catch (e) { document.body.innerHTML = '<p style="padding:20px">Storage is not available in this browser: ' + esc(e.message) + '</p>'; return; }
  render();
  if (Sync.isCloud()) Sync.start(); else Sync.setStatus('local');
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
