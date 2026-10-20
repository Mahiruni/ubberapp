/** Non-blocking route skeleton: the native splash belongs to app startup only. */
export default function Loading() {
  return (
    <div className="biloo-route-loading" role="status" aria-live="polite" aria-label="Opening page">
      <div className="biloo-route-loading__header" aria-hidden="true" />
      <div className="biloo-route-loading__main" aria-hidden="true">
        <div className="biloo-route-loading__line" />
        <div className="biloo-route-loading__line short" />
        <div className="biloo-route-loading__panel" />
      </div>
      <span className="nr-sr-only">Loading page</span>
    </div>
  );
}
