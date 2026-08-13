import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MacFetch for iPhone — Download phone pe",
  description: "YouTube video aur audio ko iPhone Files mein save karne ke liye touch-first MacFetch experience.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MacFetch",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080909",
};

export default function IOSLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
