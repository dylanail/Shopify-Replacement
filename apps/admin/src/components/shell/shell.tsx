"use client";

import { useState, type ReactNode } from "react";
import { EventsProvider } from "@/lib/events";
import { AiProvider } from "@/lib/ai-context";
import { StoreProvider } from "@/lib/store-context";
import { TopBar } from "./topbar";
import { Rail } from "./rail";
import { HelpSheet } from "./help-sheet";
import { MobileNav } from "./mobile";
import { AiPanel, MobileChatSheet } from "@/components/ai/panel";

function Frame({ children }: { children: ReactNode }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cream">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Rail onHelp={() => setHelp(true)} />
        <main id="main" className="scrollbar-thin min-w-0 flex-1 overflow-y-auto pb-[60px] md:pb-0">{children}</main>
        <AiPanel />
      </div>
      <MobileNav onHelp={() => setHelp(true)} />
      <MobileChatSheet />
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <EventsProvider>
        <AiProvider>
          <Frame>{children}</Frame>
        </AiProvider>
      </EventsProvider>
    </StoreProvider>
  );
}

/** Standard page wrapper: max width, padding. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={`mx-auto w-full px-4 py-5 sm:px-6 ${wide ? "max-w-[1400px]" : "max-w-[1180px]"} ${className ?? ""}`}>{children}</div>;
}
