import { createContext } from 'react';

/**
 * Lives apart from the provider so that file only exports components, which is what keeps
 * fast refresh working while editing the toast UI.
 */
export interface ToastApi {
  /** Something worked. Vanishes on its own. */
  saved: (message: string) => void;
  /** Something did not. Stays longer, and is announced assertively. */
  failed: (message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);
