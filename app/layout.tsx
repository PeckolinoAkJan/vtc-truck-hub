import type { Metadata } from "next";
import "./globals.css";
import "./security.css";
import "./brand-refresh.css";
import "./module-refresh.css";
import PwaRegister from "./PwaRegister";
import VtcModuleNav from "./components/VtcModuleNav";

const siteOrigin = new URL("https://vtc-truck-hub.de");
const title = "VTC Truck Hub – Die Plattform für virtuelle Speditionen";
const description =
  "Speditionen für ETS2 und ATS entdecken, verwalten und gemeinsam fahren.";

export const metadata: Metadata = {
  metadataBase: siteOrigin,
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title, description, images: ["/og.png"] },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        <PwaRegister />
        <VtcModuleNav />
        {children}
      </body>
    </html>
  );
}
