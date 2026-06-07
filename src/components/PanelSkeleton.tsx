export function PanelSkeleton({ width, height }: { width?: number | string; height?: number | string }) {
  return (
    <div
      className="glass panel-skeleton"
      style={{ width: width ?? 300, height: height ?? 400 }}
      aria-hidden="true"
    />
  );
}

export function SidePanelSkeleton() {
  return <PanelSkeleton width={300} height={420} />;
}

export function ModalSkeleton() {
  return (
    <div className="brief-overlay" aria-hidden="true">
      <PanelSkeleton width={560} height={480} />
    </div>
  );
}
