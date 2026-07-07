"use client";

import {
  CONTENT_MODE,
  WALLET_KEYS,
} from "@make-software/csprclick-core-types";
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
      accountMenuItems: [],
    };
  }

  if (!window.clickSDKOptions) {
    window.clickSDKOptions = {
      appName: "GuildNet",
      appId: "csprclick-template",
      providers: [
        WALLET_KEYS.CASPER_WALLET,
        WALLET_KEYS.LEDGER,
        WALLET_KEYS.METAMASK_SNAP,
        WALLET_KEYS.W3A_GOOGLE,
        WALLET_KEYS.W3A_APPLE,
      ],
      contentMode: CONTENT_MODE.IFRAME,
      chainName: "casper-test",
    };
  }
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  return <ClickProvider>{children}</ClickProvider>;
}
