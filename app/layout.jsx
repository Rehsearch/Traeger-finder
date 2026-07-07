import "./globals.css";

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
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
