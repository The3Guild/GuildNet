"use client";

import {
  CONTENT_MODE,
  WALLET_KEYS,
} from "@make-software/csprclick-core-types";
import { ClickProvider } from "@/contexts/click-context";
import { CHAIN_ID } from "@/lib/constants";
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
      appId: "c9446acd-7d5c-4108-be65-54fad25f",
      providers: [
        WALLET_KEYS.CASPER_WALLET,
        WALLET_KEYS.LEDGER,
        WALLET_KEYS.METAMASK_SNAP,
        WALLET_KEYS.W3A_GOOGLE,
        WALLET_KEYS.W3A_APPLE,
      ],
      contentMode: CONTENT_MODE.IFRAME,
      chainName: CHAIN_ID,
    };
  }
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  return <ClickProvider>{children}</ClickProvider>;
}
