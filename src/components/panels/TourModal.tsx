import { useEffect } from 'react';
import { useUserStore } from '../../state/userStore';

export function TourModal() {
  const { hasSeenTour, setHasSeenTour } = useUserStore();

  useEffect(() => {
    if (hasSeenTour) return;
    const id = setTimeout(() => setHasSeenTour(true), 2600);
    return () => clearTimeout(id);
  }, [hasSeenTour, setHasSeenTour]);

  if (hasSeenTour) return null;

  return (
    <div className="boot-sequence" aria-hidden="true">
      <div className="boot-reticle" />
      <div className="boot-copy">
        <span>ORBITIQ</span>
        <b>COMMAND CENTER</b>
        <i>ACQUIRING ORBITAL PICTURE</i>
      </div>
    </div>
  );
}
