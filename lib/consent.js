// Einfaches Cookie-Consent-Management (DSGVO/TTDSG-konform: Opt-in vor jedem
// nicht-notwendigen Tracking). Kategorien: "necessary" (immer aktiv, keine
// Zustimmung nötig) und "marketing" (Meta Pixel, LinkedIn Insight Tag etc. —
// darf erst NACH aktiver Zustimmung geladen werden).

const STORAGE_KEY = "rehsearch_consent";
const EVENT_NAME = "rehsearch-consent-change";

export function getConsent() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasConsentDecision() {
  return getConsent() !== null;
}

export function hasMarketingConsent() {
  const consent = getConsent();
  return !!consent?.marketing;
}

export function setConsent({ marketing }) {
  if (typeof window === "undefined") return;
  const value = {
    necessary: true,
    marketing: !!marketing,
    timestamp: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: value }));
  return value;
}

export function acceptAll() {
  return setConsent({ marketing: true });
}

export function acceptNecessaryOnly() {
  return setConsent({ marketing: false });
}

export function onConsentChange(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = (e) => callback(e.detail);
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export const CONSENT_EVENT_NAME = EVENT_NAME;
