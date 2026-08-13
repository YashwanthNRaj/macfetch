import type { Metadata, Viewport } from "next";
import "./globals.css";
import StealthShader from "./StealthShader";

export const metadata: Metadata = {
  title: "MacFetch — Seedha tere Mac pe",
  description: "YouTube video aur audio download karo—private, local aur sirf macOS ke liye.",
};

export const viewport: Viewport = {
  themeColor: "#080909",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><StealthShader />{children}</body>
    </html>
  );
}
