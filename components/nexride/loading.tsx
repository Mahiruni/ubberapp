import Image from "next/image";

export function BrandedLoader({ label = "Opening NexRide" }: { label?: string }) {
  return (
    <main className="nr-branded-loader" aria-busy="true">
      <div className="nr-loader-lockup">
        <Image
          className="nr-loader-mark"
          src="/brand/nexride-mark.svg"
          alt=""
          width={78}
          height={78}
          priority
          unoptimized
          aria-hidden="true"
        />
        <strong>NexRide</strong>
        <div className="nr-loader-line" aria-hidden="true">
          <span />
        </div>
        <span className="nr-sr-only" role="status" aria-live="polite">
          {label}
        </span>
      </div>
    </main>
  );
}
