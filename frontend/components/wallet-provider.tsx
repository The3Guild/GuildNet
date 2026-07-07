"use client";

import { ClickProvider, ClickUI, useClickRef as useCsprClickRef, DefaultThemes, buildTheme } from "@make-software/csprclick-ui";
import { ClickProvider as AppClickProvider } from "@/contexts/click-context";
import { ThemeProvider } from "styled-components";
import type { ReactNode } from "react";

const theme = buildTheme(DefaultThemes.csprclick);

function SdkBridge({ children }: { children: ReactNode }) {
  const sdk = useCsprClickRef();
  return <AppClickProvider sdk={sdk}>{children}</AppClickProvider>;
}

const clickOptions = {
  appName: "GuildNet",
  appId: "csprclick-template",
  contentMode: "iframe",
  providers: [
    "casper-wallet",
    "ledger",
    "metamask-snap",
    "csprclick-w3a-google",
    "csprclick-w3a-apple",
  ],
  chainName: "casper-test",
};

export default function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme.light}>
      <ClickProvider options={clickOptions}>
        <ClickUI rootAppElement="body" />
        <SdkBridge>{children}</SdkBridge>
      </ClickProvider>
    </ThemeProvider>
  );
}
