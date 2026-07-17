"use client";

import { useEffect, useState } from "react";
import {
  hasConsentDecision,
  acceptAll,
  acceptNecessaryOnly,
  setConsent,
  getConsent,
} from "@/lib/consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [marketingChecked, setMarketingChecked] = useState(false);

  useEffect(() => {
    setVisible(!hasConsentDecision());

    const reopen = () => {
      setMarketingChecked(!!getConsent()?.marketing);
      setVisible(true);
      setShowDetails(false);
    };
    window.addEventListener("rehsearch-open-consent", reopen);
    return () => window.removeEventListener("rehsearch-open-consent", reopen);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie-Einstellungen"
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-xl p-5 sm:p-6">
        <p className="text-sm text-gray-700 mb-4">
          Wir nutzen Cookies, um den Träger-Finder bereitzustellen. Mit deiner
          Einwilligung setzen wir zusätzlich Marketing-Cookies (z.&nbsp;B. Meta,
          LinkedIn), um zu messen, wie unsere Anzeigen wirken. Mehr dazu in
          unserer{" "}
          <a
            href="https://rehsearch.de/datenschutz-fuer-bewerber/"
            className="underline text-brand-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutzerklärung
          </a>
          .
        </p>

        {showDetails && (
          <div className="mb-4 space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Notwendig</p>
                <p className="text-xs text-gray-500">
                  Erforderlich, damit das Tool funktioniert. Kann nicht deaktiviert werden.
                </p>
              </div>
              <input type="checkbox" checked disabled className="w-4 h-4" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Marketing</p>
                <p className="text-xs text-gray-500">
                  Meta Pixel, LinkedIn Insight Tag – Anzeigenmessung und Reichweite.
                </p>
              </div>
              <input
                type="checkbox"
                checked={marketingChecked}
                onChange={(e) => setMarketingChecked(e.target.checked)}
                className="w-4 h-4"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          {!showDetails && (
            <button
              onClick={() => setShowDetails(true)}
              className="text-sm px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-50 sm:order-1"
            >
              Einstellungen
            </button>
          )}
          <button
            onClick={() => {
              acceptNecessaryOnly();
              setVisible(false);
            }}
            className="text-sm px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 sm:order-2"
          >
            Nur notwendige
          </button>
          {showDetails ? (
            <button
              onClick={() => {
                setConsent({ marketing: marketingChecked });
                setVisible(false);
              }}
              className="text-sm px-4 py-2 rounded-xl bg-brand-500 text-white hover:bg-brand-600 sm:order-3"
            >
              Auswahl speichern
            </button>
          ) : (
            <button
              onClick={() => {
                acceptAll();
                setVisible(false);
              }}
              className="text-sm px-4 py-2 rounded-xl bg-brand-500 text-white hover:bg-brand-600 sm:order-3"
            >
              Alle akzeptieren
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
