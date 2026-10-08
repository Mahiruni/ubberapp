export type RiderAvatarMode = "live" | "stale" | "pickup-only";

export function riderAvatarLabel(mode: RiderAvatarMode) {
  return mode === "live" ? "Rider · live" : mode === "stale" ? "Rider · last seen" : "Pickup · not live";
}

/** An original NexRide map character, not an emoji or third-party avatar. */
export function createRiderAvatarMarker(mode: RiderAvatarMode): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nr-rider-human-marker";
  button.dataset.mode = mode;
  button.setAttribute("aria-label", mode === "pickup-only"
    ? "Rider pickup point. Live rider location unavailable. View rider details"
    : "Assigned rider. View location status and trip details");
  // Only constant authored SVG markup is inserted; no rider-controlled HTML.
  button.innerHTML = `<span class="nr-rider-human-figure" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 56" width="44" height="56" focusable="false">
      <ellipse cx="22" cy="52" rx="13" ry="3" fill="#031c30" opacity=".28"/>
      <circle cx="22" cy="23" r="20" fill="#fff"/>
      <circle cx="22" cy="23" r="17.5" fill="#07334c"/>
      <path d="M9 37c1.7-8.5 7.2-11 13-11s11.3 2.5 13 11" fill="#00c878" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="22" cy="18.6" r="8.1" fill="#f4c4a1" stroke="#fff" stroke-width="1.8"/>
      <path d="M14.7 18.2c-.6-6.9 3.2-10.8 8.7-10.5 5.7.3 7.5 4.3 7.1 10.7-2.6-1.3-4.7-3.5-5.7-6-2.1 2.4-5.5 4.6-10.1 5.8Z" fill="#122b38"/>
    </svg>
  </span><span class="nr-rider-human-label"></span>`;
  updateRiderAvatarMarker(button, mode);
  return button;
}

export function updateRiderAvatarMarker(button: HTMLButtonElement, mode: RiderAvatarMode) {
  button.dataset.mode = mode;
  button.querySelector<HTMLElement>(".nr-rider-human-label")!.textContent = riderAvatarLabel(mode);
  button.setAttribute("aria-label", mode === "pickup-only"
    ? "Pickup point only. The rider has not shared a live location."
    : mode === "stale" ? "Rider location last known. Updates are delayed."
    : "Assigned rider's live location. View details.");
}
