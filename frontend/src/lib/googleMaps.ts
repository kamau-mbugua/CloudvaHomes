/**
 * Loads the Google Maps JavaScript API once per page with KodiHub's browser key (set by
 * KodiHub admin). Resolves to `google.maps`, whose `importLibrary` loads parts on demand.
 */
export interface GoogleMapsNamespace {
  importLibrary: (name: string) => Promise<unknown>;
}

type MapsWindow = Window & {
  google?: { maps?: GoogleMapsNamespace };
  gm_authFailure?: () => void;
};

let loading: Promise<GoogleMapsNamespace> | null = null;
let authFailed = false;

/** True once Google refused the key (wrong key, API not enabled, or site not allowed). */
export function googleMapsKeyRefused(): boolean {
  return authFailed;
}

export function loadGoogleMaps(key: string): Promise<GoogleMapsNamespace> {
  const w = window as MapsWindow;
  if (w.google?.maps?.importLibrary) return Promise.resolve(w.google.maps);
  if (loading) return loading;
  w.gm_authFailure = () => {
    authFailed = true;
  };
  loading = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;
    s.async = true;
    s.onload = () => {
      const maps = w.google?.maps;
      if (maps?.importLibrary) resolve(maps);
      else reject(new Error('Google Maps did not load'));
    };
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Google Maps could not be reached'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
