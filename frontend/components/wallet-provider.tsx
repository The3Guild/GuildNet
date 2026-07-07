"use client";

import {
  CONTENT_MODE,
} from "@make-software/csprclick-core-types";
import type { CsprClickInitOptions } from "@make-software/csprclick-core-types";
import type { ClickUIOptions } from "@make-software/csprclick-core-types/clickui";
import { ClickProvider } from "@/contexts/click-context";
import type { ReactNode } from "react";

if (typeof window !== "undefined") {
  if (!window.clickUIOptions) {
    window.clickUIOptions = {
      uiContainer: "csprclick-ui",
      rootAppElement: "#root",
      show1ClickModal: true,
      showTopBar: false,
      defaultTheme: "dark",
    } as ClickUIOptions;
  }

  if (!window.clickSDKOptions) {
    window.clickSDKOptions = {
      appName: "GuildNet",
      appId: "csprclick-template",
      providers: [
        "casper-wallet",
        "ledger",
        "metamask-snap",
        "csprclick-w3a-google",
        "csprclick-w3a-apple",
      ],
      contentMode: CONTENT_MODE.IFRAME,
    } as CsprClickInitOptions;
  }
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  return <ClickProvider>{children}</ClickProvider>;
}
