import { useContext } from 'react';
import { ToastContext } from './toastContext';
import type { ToastApi } from './toastContext';

/**
 * Outside a provider this is a no-op rather than a crash.
 *
 * A missing confirmation is a small loss; a white screen because a leaf component was
 * rendered without the provider is not.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);

  return api ?? { saved: () => {}, failed: () => {} };
}
