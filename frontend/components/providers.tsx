"use client";

import { ClickProvider } from "@/contexts/click-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ClickProvider>{children}</ClickProvider>;
}
