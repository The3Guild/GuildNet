"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type {
  AccountType,
  ICSPRClickSDK,
  SignTypedDataParams,
  SignTypedDataResult,
} from "@make-software/csprclick-core-types";

interface ClickContextState {
  publicKey: string | undefined;
  provider: string | undefined;
  clickRef: ICSPRClickSDK | undefined;
  ready: boolean;
  error: string | null;
  signTypedData: (params: SignTypedDataParams) => Promise<SignTypedDataResult | undefined>;
}

const ClickContext = createContext<ClickContextState | undefined>(undefined);

interface ClickProviderProps {
  children: ReactNode;
  sdk: ICSPRClickSDK | undefined;
}

export function ClickProvider({ children, sdk }: ClickProviderProps) {
  const [connectedAccount, setConnectedAccount] = useState<AccountType | undefined>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sdk) {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          setError("CSPR.click SDK failed to load");
        }, 15000);
      }
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    setReady(true);
    setError(null);

    if (sdk.currentAccount?.public_key) {
      setConnectedAccount(sdk.currentAccount);
    }

    const handleAccountChanged = (account?: AccountType) => {
      setConnectedAccount(account?.public_key ? account : undefined);
    };

    const onSignedIn = (event: { account?: AccountType }) => handleAccountChanged(event.account);
    const onSwitchedAccount = (event: { account?: AccountType }) => handleAccountChanged(event.account);
    const onUnsolicitedChange = (event: { account?: AccountType }) => handleAccountChanged(event.account);
    const onSignedOut = () => setConnectedAccount(undefined);

    sdk.on("csprclick:signed_in", onSignedIn);
    sdk.on("csprclick:switched_account", onSwitchedAccount);
    sdk.on("csprclick:unsolicited_account_change", onUnsolicitedChange);
    sdk.on("csprclick:signed_out", onSignedOut);

    return () => {
      sdk.removeListener("csprclick:signed_in", onSignedIn);
      sdk.removeListener("csprclick:switched_account", onSwitchedAccount);
      sdk.removeListener("csprclick:unsolicited_account_change", onUnsolicitedChange);
      sdk.removeListener("csprclick:signed_out", onSignedOut);
    };
  }, [sdk]);

  const signTypedData = useCallback(
    async (params: SignTypedDataParams): Promise<SignTypedDataResult | undefined> => {
      const pk = connectedAccount?.public_key;
      if (!sdk || !pk) return undefined;
      return sdk.signTypedData(params, pk);
    },
    [sdk, connectedAccount]
  );

  return (
    <ClickContext.Provider
      value={{
        publicKey: connectedAccount?.public_key,
        provider: connectedAccount?.provider,
        clickRef: sdk,
        ready,
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
