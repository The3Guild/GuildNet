"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import {
  CONTENT_MODE,
  WALLET_KEYS,
} from "@make-software/csprclick-core-types";
import type {
  AccountType,
  CsprClickInitOptions,
  ICSPRClickSDK,
  SignTypedDataParams,
  SignTypedDataResult,
} from "@make-software/csprclick-core-types";
import type { ClickUIOptions } from "@make-software/csprclick-core-types/clickui";

declare global {
  interface Window {
    clickUIOptions: ClickUIOptions;
    clickSDKOptions: CsprClickInitOptions;
    csprclick?: ICSPRClickSDK;
  }
}

interface ClickContextState {
  publicKey: string | undefined;
  provider: string | undefined;
  clickRef: ICSPRClickSDK | undefined;
  signTypedData: (params: SignTypedDataParams) => Promise<SignTypedDataResult | undefined>;
}

const ClickContext = createContext<ClickContextState | undefined>(undefined);

interface ClickProviderProps {
  children: ReactNode;
}

export function ClickProvider({ children }: ClickProviderProps) {
  const [connectedAccount, setConnectedAccount] = useState<AccountType | undefined>();
  const [clickRef, setClickRef] = useState<ICSPRClickSDK | undefined>();

  useEffect(() => {
    window.clickUIOptions = {
      uiContainer: "csprclick-ui",
      rootAppElement: "#__next",
      show1ClickModal: true,
      showTopBar: true,
      accountMenuItems: [
        "AccountCardMenuItem",
        "CopyHashMenuItem",
        "BuyCSPRMenuItem",
      ],
      defaultTheme: "dark",
    };

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

    const checkActiveAccount = async (ref: ICSPRClickSDK) => {
      try {
        const account = await ref.getActiveAccountAsync({
          withBalance: true,
          withFiatCurrency: "USD",
        });
        setConnectedAccount(account?.public_key ? account : undefined);
      } catch {
        setConnectedAccount(undefined);
      }
    };

    const handleAccountChanged = (event: { account?: AccountType }) => {
      setConnectedAccount(event.account?.public_key ? event.account : undefined);
    };

    const handleSdkLoaded = () => {
      const ref = window.csprclick;
      if (!ref) return;
      setClickRef(ref);
      ref.on("csprclick:signed_in", handleAccountChanged);
      ref.on("csprclick:switched_account", handleAccountChanged);
      ref.on("csprclick:unsolicited_account_change", handleAccountChanged);
      ref.on("csprclick:signed_out", () => setConnectedAccount(undefined));
      checkActiveAccount(ref);
    };

    window.addEventListener("csprclick:loaded", handleSdkLoaded);
    if (window.csprclick) handleSdkLoaded();

    if (!document.querySelector("script#csprclick-client")) {
      const script = document.createElement("script");
      script.src = "https://cdn.cspr.click/ui/v2.1.0/csprclick-client-2.1.0.js";
      script.id = "csprclick-client";
      script.async = true;
      document.head.appendChild(script);
    }

    return () => {
      window.removeEventListener("csprclick:loaded", handleSdkLoaded);
    };
  }, []);

  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<SignTypedDataResult | undefined> => {
      const ref = clickRef ?? window.csprclick;
      const pk = connectedAccount?.public_key;
      if (!ref || !pk) return undefined;
      return ref.signTypedData(params, pk);
    },
    [clickRef, connectedAccount]
  );

  return (
    <ClickContext.Provider
      value={{
        publicKey: connectedAccount?.public_key,
        provider: connectedAccount?.provider,
        clickRef,
        signTypedData,
      }}
    >
      {children}
    </ClickContext.Provider>
  );
}

export function useClickRef(): ClickContextState {
  const context = useContext(ClickContext);
  if (!context) {
    throw new Error("useClickRef must be used within a ClickProvider");
  }
  return context;
}
