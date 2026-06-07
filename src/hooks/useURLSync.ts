import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { useStore } from '../state/store';
import { CS } from '../state/catalogStore';
import type { BandKey, GroupKey } from '../types';

export function useURLSync(pendingSatRef: MutableRefObject<number | null>) {
  const store = useStore();

  // Restore state from URL hash on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const band = params.get('band') as BandKey | null;
    const region = params.get('region');
    const groups = params.get('groups');
    const sat = params.get('sat');

    if (band) useStore.getState().setFilterBand(band);
    if (region) useStore.getState().setFilterRegion(region);
    if (groups) {
      const gs = groups.split(',').filter(Boolean) as GroupKey[];
      if (gs.length > 0) useStore.getState().setActiveGroups(new Set(gs));
    }
    if (sat) {
      const satnum = Number(sat);
      if (Number.isFinite(satnum) && satnum > 0) pendingSatRef.current = satnum;
    }
  }, []);

  // Write state to URL hash on filter changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (store.filterBand) params.set('band', store.filterBand);
    if (store.filterRegion) params.set('region', store.filterRegion);
    if (store.activeGroups.size > 0) params.set('groups', Array.from(store.activeGroups).join(','));
    if (store.selected >= 0 && CS.catalog[store.selected]) {
      params.set('sat', CS.catalog[store.selected].satnum.toString());
    }
    const hash = params.toString();
    const newUrl = hash ? `${window.location.pathname}#${hash}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [store.filterBand, store.filterRegion, store.activeGroups, store.selected]);
}
