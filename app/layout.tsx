import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./security.css";
import "./brand-refresh.css";
import PwaRegister from "./PwaRegister";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const h=await headers(),host=h.get("x-forwarded-host")??h.get("host")??"localhost:3000",proto=h.get("x-forwarded-proto")??(host.includes("localhost")?"http":"https"),image=`${proto}://${host}/og.png`;
  const title="VTC Truck Hub – Die Plattform für virtuelle Speditionen",description="Speditionen für ETS2 und ATS entdecken, verwalten und gemeinsam fahren.";
  return {title,description,icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"},openGraph:{title,description,images:[image]},twitter:{card:"summary_large_image",title,description,images:[image]}};
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body className={`${geistSans.variable} ${geistMono.variable}`}><PwaRegister/>{children}</body></html>;
}
