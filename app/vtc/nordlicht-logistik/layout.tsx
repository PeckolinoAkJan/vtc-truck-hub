import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Speditionsprofil – VTC Truck Hub",
  description: "Weiterleitung eines früheren Demo-Profils auf eine registrierte Spedition.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
