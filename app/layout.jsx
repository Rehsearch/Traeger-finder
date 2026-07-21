import "./globals.css";
import CookieConsent from "@/components/CookieConsent";
import MetaPixel from "@/components/MetaPixel";

export const metadata = {
  title: "Träger-Finder | Rehsearch",
  description: "Finde den Pflegeträger, der wirklich zu dir passt.",
  openGraph: {
    title: "Träger-Finder | Rehsearch",
    description: "Beantworte 8 Fragen – wir zeigen dir, welcher Träger am besten zu dir passt.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body className="bg-gray-50 min-h-screen">
        {children}
        <footer className="text-center text-xs text-gray-400 py-6">
          <a href="/impressum" className="underline">Impressum</a>
          {" · "}
          <a href="/datenschutz" className="underline">Datenschutz</a>
        </footer>
        <CookieConsent />
        <MetaPixel />
      </body>
    </html>
  );
}
