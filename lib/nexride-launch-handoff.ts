/** Keep the one native launch screen until routing/session restoration settles. */
export function watchLaunchContent(root: HTMLElement, onReady: () => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const ready = () => Boolean(root.querySelector("main, [role='alert']")) &&
    !root.querySelector('[data-nr-startup-pending="true"]');
  const check = () => {
    clearTimeout(timer);
    // Let the current React commit/redirect finish before releasing native UI.
    timer = setTimeout(() => {
      if (stopped || !ready()) return;
      stop();
      onReady();
    }, 0);
  };
  const observer = new MutationObserver(check);
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
  };
  observer.observe(root, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["data-nr-startup-pending"] });
  check();
  return stop;
}
