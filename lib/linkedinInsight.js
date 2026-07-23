import { hasMarketingConsent, onConsentChange } from "@/lib/consent";

const PARTNER_ID    = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;
const CONVERSION_ID = process.env.NEXT_PUBLIC_LINKEDIN_CONVERSION_ID;

let injected = false;

function injectBaseTag() {
  if (injected || !PARTNER_ID || typeof window === "undefined") return;
  injected = true;

  window._linkedin_partner_id = PARTNER_ID;
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(PARTNER_ID);

  (function (l) {
    if (!l) {
      window.lintrk = function (a, b) { window.lintrk.q.push([a, b]); };
      window.lintrk.q = [];
    }
    var s = document.getElementsByTagName("script")[0];
    var b = document.createElement("script");
    b.type = "text/javascript";
    b.async = true;
    b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
    s.parentNode.insertBefore(b, s);
  })(window.lintrk);
}

export function initLinkedInInsightIfConsented() {
  if (typeof window === "undefined") return;
  if (hasMarketingConsent()) injectBaseTag();

  onConsentChange((consent) => {
    if (consent?.marketing) injectBaseTag();
  });
}

export function trackLinkedInConversion() {
  if (typeof window === "undefined" || !window.lintrk || !hasMarketingConsent()) return;
  if (!CONVERSION_ID) return;
  window.lintrk("track", { conversion_id: CONVERSION_ID });
}
