import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { listSystemSummaries } from "@/lib/systems";
import { AUTO_EXIT } from "@/lib/app-lifetime";
import "./globals.css";

// Everything reads from the local SQLite database at request time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "MUNE TOKENS", template: "%s · MUNE TOKENS" },
  description: "Local-first design-system builder.",
  applicationName: "MUNE TOKENS",
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const systems = listSystemSummaries();
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body>
        <TooltipProvider delayDuration={300}>
          <AppShell systems={systems} launched={AUTO_EXIT}>
            {children}
          </AppShell>
        </TooltipProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
