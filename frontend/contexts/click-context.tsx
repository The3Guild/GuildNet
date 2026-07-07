"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type {
  AccountType,
  ICSPRClickSDK,
  SignTypedDataParams,
  SignTypedDataResult,
} from "@make-software/csprclick-core-types";
import type { ClickUIOptions } from "@make-software/csprclick-core-types/clickui";

declare global {
  interface Window {
    clickUIOptions: ClickUIOptions;
    clickSDKOptions: Record<string, unknown>;
    csprclick?: ICSPRClickSDK;
  }
}

interface ClickContextState {
  publicKey: string | undefined;
  provider: string | undefined;
  clickRef: ICSPRClickSDK | undefined;
  ready: boolean;
  error: string | null;
  signTypedData: (params: SignTypedDataParams) => Promise<SignTypedDataResult | undefined>;
}

type AccountChangedEvent = {
  account?: AccountType;
};

const ClickContext = createContext<ClickContextState | undefined>(undefined);

interface ClickProviderProps {
  children: ReactNode;
}

const CSPR_CLICK_SCRIPT_ID = "csprclick-client";

export function ClickProvider({ children }: ClickProviderProps) {
  const [connectedAccount, setConnectedAccount] = useState<AccountType | undefined>();
  const [clickRef, setClickRef] = useState<ICSPRClickSDK | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const checkActiveAccount = async (ref: ICSPRClickSDK) => {
      try {
        const account = await ref.getActiveAccountAsync({
          withBalance: true,
        });
        setConnectedAccount(account?.public_key ? account : undefined);
      } catch {
        setConnectedAccount(undefined);
      }
    };

    const handleAccountChanged = (event: AccountChangedEvent) => {
      setConnectedAccount(event.account?.public_key ? event.account : undefined);
    };

    const handleSdkLoaded = () => {
      const ref = window.csprclick;
      if (!ref) return;
      setClickRef(ref);
      setSdkLoaded(true);
      setError(null);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      ref.on("csprclick:signed_in", handleAccountChanged);
      ref.on("csprclick:switched_account", handleAccountChanged);
      ref.on("csprclick:unsolicited_account_change", handleAccountChanged);
      ref.on("csprclick:signed_out", () => setConnectedAccount(undefined));
      ref.on("csprclick:disconnected", () => setConnectedAccount(undefined));
      checkActiveAccount(ref);
    };

    window.addEventListener("csprclick:loaded", handleSdkLoaded);

    if (window.csprclick) {
      handleSdkLoaded();
    }

    if (!document.querySelector(`script#${CSPR_CLICK_SCRIPT_ID}`)) {
      const script = document.createElement("script");
      script.src = "https://cdn.cspr.click/ui/v2.1.0/csprclick-client-2.1.0.js";
      script.id = CSPR_CLICK_SCRIPT_ID;
      script.async = true;
      document.head.appendChild(script);
    }

    timeoutRef.current = setTimeout(() => {
      if (!window.csprclick) {
        setError("CSPR.click SDK failed to load — check your network or ad-blocker.");
      }
    }, 30000);

    return () => {
      window.removeEventListener("csprclick:loaded", handleSdkLoaded);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<SignTypedDataResult | undefined> => {
      const pk = connectedAccount?.public_key;
      if (!clickRef || !pk) return undefined;
      return clickRef.signTypedData(params, pk);
    },
    [clickRef, connectedAccount]
  );

  return (
    <ClickContext.Provider
      value={{
        publicKey: connectedAccount?.public_key,
        provider: connectedAccount?.provider,
        clickRef,
        ready: sdkLoaded,
        error,
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
