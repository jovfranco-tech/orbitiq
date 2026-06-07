import { onAuthStateChanged, signInAnonymously, type Unsubscribe as AuthUnsubscribe } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe as FirestoreUnsubscribe } from 'firebase/firestore';
import { getFirebaseClient } from '../config/firebase';
import { useUserStore, type UserState } from '../state/userStore';
import type { UserExportData } from '../types';
import { validateUserExportData } from '../utils/userData';

const CLOUD_SYNC_VERSION = 'orbitiq-user-data-v1';
const SAVE_DEBOUNCE_MS = 900;

type UserDataSlice = Pick<UserExportData, 'watchlists' | 'savedViews' | 'snapshots'> & {
  hasSeenTour?: boolean;
  version?: string;
  exportedAt?: number;
};

function toExportData(state: UserState): UserExportData & { hasSeenTour: boolean } {
  return {
    version: CLOUD_SYNC_VERSION,
    exportedAt: Date.now(),
    watchlists: state.watchlists,
    savedViews: state.savedViews,
    snapshots: state.snapshots,
    hasSeenTour: state.hasSeenTour,
  };
}

function normalizeRemoteData(data: Partial<UserDataSlice> | undefined): UserDataSlice {
  const parsed = validateUserExportData({
    version: typeof data?.version === 'string' ? data.version : CLOUD_SYNC_VERSION,
    exportedAt: typeof data?.exportedAt === 'number' ? data.exportedAt : Date.now(),
    watchlists: data?.watchlists,
    savedViews: data?.savedViews,
    snapshots: data?.snapshots,
  }, { requireVersion: false });

  return {
    watchlists: parsed.watchlists,
    savedViews: parsed.savedViews,
    snapshots: parsed.snapshots,
    hasSeenTour: typeof data?.hasSeenTour === 'boolean' ? data.hasSeenTour : undefined,
    version: parsed.version,
    exportedAt: parsed.exportedAt,
  };
}

function hasLocalData(data: UserExportData): boolean {
  return data.watchlists.length > 0 || data.savedViews.length > 0 || data.snapshots.length > 0;
}

export function startFirebaseCloudSync(): () => void {
  const client = getFirebaseClient();
  if (!client) {
    useUserStore.getState().setCloudSyncState('disabled');
    return () => undefined;
  }

  let disposed = false;
  let authUnsubscribe: AuthUnsubscribe | null = null;
  let firestoreUnsubscribe: FirestoreUnsubscribe | null = null;
  let storeUnsubscribe: (() => void) | null = null;
  let saveTimer: number | null = null;
  let applyingRemote = false;
  let currentUserId: string | null = null;
  let initialMergeWritten = false;
  const localDataAtStart = toExportData(useUserStore.getState());

  const clearSaveTimer = () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const scheduleSave = (delayMs = SAVE_DEBOUNCE_MS) => {
    if (!currentUserId || disposed) return;
    clearSaveTimer();
    useUserStore.getState().setCloudSyncState('syncing', currentUserId);

    saveTimer = window.setTimeout(() => {
      if (!currentUserId || disposed) return;
      const data = toExportData(useUserStore.getState());
      const userDoc = doc(client.db, 'users', currentUserId, 'orbitiq', 'userData');
      void setDoc(userDoc, {
        ...data,
        updatedAt: serverTimestamp(),
        clientUpdatedAt: Date.now(),
      }, { merge: true }).then(() => {
        if (!disposed && currentUserId) {
          useUserStore.getState().setCloudSyncState('synced', currentUserId);
        }
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Cloud sync failed';
        if (!disposed) useUserStore.getState().setCloudSyncState('error', currentUserId, message);
      });
    }, delayMs);
  };

  const startFirestoreSync = (uid: string) => {
    if (currentUserId === uid) return;
    currentUserId = uid;
    initialMergeWritten = false;
    firestoreUnsubscribe?.();
    storeUnsubscribe?.();
    useUserStore.getState().setCloudSyncState('connecting', uid);

    const userDoc = doc(client.db, 'users', uid, 'orbitiq', 'userData');

    firestoreUnsubscribe = onSnapshot(userDoc, (snapshot) => {
      if (disposed || snapshot.metadata.hasPendingWrites) return;

      if (!snapshot.exists()) {
        if (!initialMergeWritten) {
          initialMergeWritten = true;
          scheduleSave(0);
        }
        return;
      }

      let remote: UserDataSlice;
      try {
        remote = normalizeRemoteData(snapshot.data() as Partial<UserDataSlice>);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Remote cloud data failed validation';
        useUserStore.getState().setCloudSyncState('error', uid, message);
        return;
      }

      applyingRemote = true;
      useUserStore.getState().importData({
        version: remote.version ?? CLOUD_SYNC_VERSION,
        exportedAt: remote.exportedAt ?? Date.now(),
        watchlists: remote.watchlists,
        savedViews: remote.savedViews,
        snapshots: remote.snapshots,
      });
      if (typeof remote.hasSeenTour === 'boolean') {
        useUserStore.getState().setHasSeenTour(remote.hasSeenTour);
      }
      applyingRemote = false;

      useUserStore.getState().setCloudSyncState('synced', uid);

      if (!initialMergeWritten) {
        initialMergeWritten = true;
        if (hasLocalData(localDataAtStart)) scheduleSave(0);
      }
    }, (err) => {
      if (!disposed) useUserStore.getState().setCloudSyncState('error', uid, err.message);
    });

    storeUnsubscribe = useUserStore.subscribe((state, previous) => {
      if (applyingRemote) return;
      const dataChanged =
        state.watchlists !== previous.watchlists ||
        state.savedViews !== previous.savedViews ||
        state.snapshots !== previous.snapshots ||
        state.hasSeenTour !== previous.hasSeenTour;
      if (dataChanged) scheduleSave();
    });
  };

  useUserStore.getState().setCloudSyncState('connecting');
  authUnsubscribe = onAuthStateChanged(client.auth, (user) => {
    if (disposed) return;
    if (user) {
      startFirestoreSync(user.uid);
    } else {
      void signInAnonymously(client.auth).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Anonymous Firebase auth failed';
        if (!disposed) useUserStore.getState().setCloudSyncState('error', null, message);
      });
    }
  }, (err) => {
    if (!disposed) useUserStore.getState().setCloudSyncState('error', null, err.message);
  });

  return () => {
    disposed = true;
    clearSaveTimer();
    authUnsubscribe?.();
    firestoreUnsubscribe?.();
    storeUnsubscribe?.();
  };
}
