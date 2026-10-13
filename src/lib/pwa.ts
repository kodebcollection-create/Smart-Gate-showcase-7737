// The only place the app's offline service worker is registered.
export function setupServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const h = location.hostname;
  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    h.startsWith("id-preview--") || h.startsWith("preview--") ||
    /(^|\.)lovableproject(-dev)?\.com$/.test(h) ||
    /(^|\.)beta\.lovable\.dev$/.test(h) ||
    new URLSearchParams(location.search).get("sw") === "off";
  if (refused) {
    void navigator.serviceWorker.getRegistrations().then((rs) =>
      rs.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).forEach((r) => void r.unregister()),
    );
    return;
  }
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
}
