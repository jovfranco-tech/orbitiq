import { useEffect } from 'react';
import { useUserStore } from '../state/userStore';

function isFirebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID
  );
}

export function useFirebaseCloudSync() {
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      useUserStore.getState().setCloudSyncState('disabled');
      return;
    }

    let cleanup: (() => void) | undefined;
    let disposed = false;
    useUserStore.getState().setCloudSyncState('connecting');

    void import('../services/firebaseCloudSync').then(({ startFirebaseCloudSync }) => {
      if (disposed) return;
      cleanup = startFirebaseCloudSync();
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Firebase cloud sync failed to load';
      if (!disposed) useUserStore.getState().setCloudSyncState('error', null, message);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
}
