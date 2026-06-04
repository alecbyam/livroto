import type { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { WhatsAppFab } from "./WhatsAppFab";
import { MobileTabBar } from "./MobileTabBar";
import { WelcomeBanner } from "./WelcomeBanner";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <WelcomeBanner />
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <Footer />
      <WhatsAppFab />
      <MobileTabBar />
    </div>
  );
}