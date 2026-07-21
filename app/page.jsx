import MatchingTool from "@/components/MatchingTool";

export default function Home() {
  if (process.env.MAINTENANCE_MODE === "true") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center">
          <img src="/logo.png" alt="Rehsearch" className="h-8 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            In Kürze für dich da
          </h1>
          <p className="text-gray-600">
            Der Träger-Finder wird gerade vorbereitet und ist in Kürze wieder erreichbar.
            Bei Fragen erreichst du uns unter{" "}
            <a href="mailto:pfk@rehsearch.de" className="text-brand-600 underline">
              pfk@rehsearch.de
            </a>
            .
          </p>
          <p className="text-xs text-gray-400 mt-8">
            <a href="/impressum" className="underline">Impressum</a>
            {" · "}
            <a href="/datenschutz" className="underline">Datenschutz</a>
          </p>
        </div>
      </main>
    );
  }

  return <MatchingTool />;
}
