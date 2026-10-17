import { afterEach, expect, test, vi } from "vitest";
import { watchLaunchContent } from "../../lib/nexride-launch-handoff";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function launch() {
  vi.useFakeTimers();
  let notify = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("MutationObserver", class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const screen = { content: false, pending: true };
  const root = { querySelector: (selector: string) =>
    selector.includes("data-nr-startup-pending") ? screen.pending : screen.content,
  } as unknown as HTMLElement;
  const hide = vi.fn();
  const stop = watchLaunchContent(root, hide);
  return { screen, hide, stop, disconnect, update: () => { notify(); vi.runAllTimers(); } };
}

test.each(["rider", "driver"])("%s keeps one native splash through loading and session redirects", () => {
  const app = launch();
  app.update(); // Before streamed content exists.
  expect(app.hide).not.toHaveBeenCalled();
  app.screen.content = true;
  app.update(); // Route fallback, session restore, then destination guard.
  app.update();
  expect(app.hide).not.toHaveBeenCalled();
  app.screen.pending = false;
  app.update(); // Interactive welcome or dashboard.
  expect(app.hide).toHaveBeenCalledTimes(1);
  expect(app.disconnect).toHaveBeenCalledOnce();
  app.screen.pending = true;
  app.update();
  app.screen.pending = false;
  app.update();
  expect(app.hide).toHaveBeenCalledTimes(1); // No replay on navigation/resume.
});

test("a recovery screen releases the native splash immediately", () => {
  const app = launch();
  app.screen.content = true;
  app.screen.pending = false;
  app.update();
  expect(app.hide).toHaveBeenCalledOnce();
});

test("unmount cancels a scheduled handoff (including React Strict Mode cleanup)", () => {
  const app = launch();
  app.screen.content = true;
  app.screen.pending = false;
  app.stop();
  vi.runAllTimers();
  expect(app.hide).not.toHaveBeenCalled();
  expect(app.disconnect).toHaveBeenCalledOnce();
});
