import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WatchlistItem, SavedMissionView, ExecutiveSnapshot, UserExportData, CloudSyncStatus } from '../types';

export interface UserState {
  watchlists: WatchlistItem[];
  savedViews: SavedMissionView[];
  snapshots: ExecutiveSnapshot[];
  showWatchlistPanel: boolean;
  showSavedViewsPanel: boolean;
  showSnapshotPanel: boolean;
  hasSeenTour: boolean;
  cloudSyncStatus: CloudSyncStatus;
  cloudUserId: string | null;
  cloudSyncError: string | null;
  
  // Panel UI toggles
  setShowWatchlistPanel: (v: boolean) => void;
  setShowSavedViewsPanel: (v: boolean) => void;
  setShowSnapshotPanel: (v: boolean) => void;
  setHasSeenTour: (v: boolean) => void;
  setCloudSyncState: (status: CloudSyncStatus, userId?: string | null, error?: string | null) => void;
  
  // Watchlist
  addToWatchlist: (item: Omit<WatchlistItem, 'addedAt'>) => void;
  removeFromWatchlist: (satnum: number) => void;
  
  // Saved Views
  saveView: (view: Omit<SavedMissionView, 'id' | 'createdAt'>) => void;
  deleteView: (id: string) => void;
  renameView: (id: string, name: string) => void;
  
  // Snapshots
  createSnapshot: (snap: Omit<ExecutiveSnapshot, 'id' | 'timestamp'>) => void;
  deleteSnapshot: (id: string) => void;
  
  // Import/Export
  importData: (data: UserExportData) => void;
  replaceData: (data: Pick<UserExportData, 'watchlists' | 'savedViews' | 'snapshots'> & { hasSeenTour?: boolean }) => void;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
}

const BROADCAST_CHANNEL = 'orbitiq-user-data-sync';

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      watchlists: [],
      savedViews: [],
      snapshots: [],
      showWatchlistPanel: false,
      showSavedViewsPanel: false,
      showSnapshotPanel: false,
      hasSeenTour: false,
      cloudSyncStatus: 'disabled',
      cloudUserId: null,
      cloudSyncError: null,
      
      setShowWatchlistPanel: (v) => set({ showWatchlistPanel: v, showSavedViewsPanel: false, showSnapshotPanel: false }),
      setShowSavedViewsPanel: (v) => set({ showSavedViewsPanel: v, showWatchlistPanel: false, showSnapshotPanel: false }),
      setShowSnapshotPanel: (v) => set({ showSnapshotPanel: v, showWatchlistPanel: false, showSavedViewsPanel: false }),
      setHasSeenTour: (v) => set({ hasSeenTour: v }),
      setCloudSyncState: (status, userId = null, error = null) => set({
        cloudSyncStatus: status,
        cloudUserId: userId,
        cloudSyncError: error,
      }),
      
      addToWatchlist: (item) => set((state) => {
        if (state.watchlists.some(w => w.satnum === item.satnum)) return state;
        return { watchlists: [{ ...item, addedAt: Date.now() }, ...state.watchlists] };
      }),
      
      removeFromWatchlist: (satnum) => set((state) => ({
        watchlists: state.watchlists.filter(w => w.satnum !== satnum)
      })),
      
      saveView: (view) => set((state) => ({
        savedViews: [{ ...view, id: generateId(), createdAt: Date.now() }, ...state.savedViews]
      })),
      
      deleteView: (id) => set((state) => ({
        savedViews: state.savedViews.filter(v => v.id !== id)
      })),
      
      renameView: (id, name) => set((state) => ({
        savedViews: state.savedViews.map(v => v.id === id ? { ...v, name } : v)
      })),
      
      createSnapshot: (snap) => set((state) => ({
        snapshots: [{ ...snap, id: generateId(), timestamp: Date.now() }, ...state.snapshots]
      })),
      
      deleteSnapshot: (id) => set((state) => ({
        snapshots: state.snapshots.filter(s => s.id !== id)
      })),
      
      importData: (data) => set((state) => {
        // Merge strategy: keep existing, prepend new unique ones
        const mergedWatchlists = [...state.watchlists];
        data.watchlists.forEach(w => {
          if (!mergedWatchlists.some(mw => mw.satnum === w.satnum)) mergedWatchlists.unshift(w);
        });
        
        const mergedViews = [...state.savedViews];
        data.savedViews.forEach(v => {
          if (!mergedViews.some(mv => mv.id === v.id)) mergedViews.unshift(v);
        });
        
        const mergedSnaps = [...state.snapshots];
        data.snapshots.forEach(s => {
          if (!mergedSnaps.some(ms => ms.id === s.id)) mergedSnaps.unshift(s);
        });
        
        return {
          watchlists: mergedWatchlists,
          savedViews: mergedViews,
          snapshots: mergedSnaps
        };
      }),

      replaceData: (data) => set({
        watchlists: data.watchlists,
        savedViews: data.savedViews,
        snapshots: data.snapshots,
        ...(typeof data.hasSeenTour === 'boolean' ? { hasSeenTour: data.hasSeenTour } : {}),
      }),
    }),
    {
      name: 'orbitiq-user-data',
      partialize: (state) => ({
        watchlists: state.watchlists,
        savedViews: state.savedViews,
        snapshots: state.snapshots,
        hasSeenTour: state.hasSeenTour,
      }),
    }
  )
);

// Cross-tab sync via BroadcastChannel (same browser, different tabs)
if (typeof BroadcastChannel !== 'undefined') {
  const channel = new BroadcastChannel(BROADCAST_CHANNEL);
  let isSyncing = false;

  useUserStore.subscribe((state) => {
    if (isSyncing) return;
    channel.postMessage({
      watchlists: state.watchlists,
      savedViews: state.savedViews,
      snapshots: state.snapshots,
    });
  });

  channel.onmessage = (e: MessageEvent) => {
    isSyncing = true;
    useUserStore.setState({
      watchlists: e.data.watchlists ?? [],
      savedViews: e.data.savedViews ?? [],
      snapshots: e.data.snapshots ?? [],
    });
    isSyncing = false;
  };
}
