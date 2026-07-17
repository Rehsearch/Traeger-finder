import { hasMarketingConsent, onConsentChange } from "@/lib/consent";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

let injected = false;

function injectBasePixel() {
  if (injected || !PIXEL_ID || typeof window === "undefined") return;
  injected = true;

  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  window.fbq("set", "autoConfig", false, PIXEL_ID);
  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

export function initMetaPixelIfConsented() {
  if (typeof window === "undefined") return;
  if (hasMarketingConsent()) injectBasePixel();

  onConsentChange((consent) => {
    if (consent?.marketing) injectBasePixel();
  });
}

function track(eventName, params) {
  if (typeof window === "undefined" || !window.fbq || !hasMarketingConsent()) return;
  window.fbq("track", eventName, params);
}

export function trackLead() {
  track("Lead", { content_name: "Träger-Finder Kontaktformular" });
}

export function trackStartedQuestionnaire() {
  track("InitiateCheckout", { content_name: "Träger-Finder Fragebogen gestartet" });
}
