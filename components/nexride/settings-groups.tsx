"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./ui";
import "./settings-groups.css";

type SettingsGroup = {
  id: string;
  title: string;
  summary: string;
  icon: IconName;
  children: ReactNode;
};

/**
 * Five simple navigation destinations, not an accordion.
 * Visited panels remain mounted (but hidden) so draft forms and switches retain
 * their state when a user returns to the home list or changes the language.
 */
export function SettingsGroups({ groups, homeLabel = "Settings", backLabel = "Back to Settings" }: {
  groups: SettingsGroup[];
  homeLabel?: string;
  backLabel?: string;
}) {
  const scope = useId();
  const [active, setActive] = useState<string | null>(null);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const previousFocus = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (active) heading.current?.focus();
    else previousFocus.current?.focus();
  }, [active]);

  useEffect(() => {
    // The Android hardware Back button and browser Back return from a detail
    // panel to the list instead of discarding its host Rider dialog/Driver page.
    const onPopState = () => setActive(null);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const open = (id: string) => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVisited(value => ({ ...value, [id]: true }));
    try {
      window.history.pushState({ ...window.history.state, nexrideSettingsDetail: id }, "");
    } catch {
      // Embedded WebViews with unavailable History API still use the visible Back control.
    }
    setActive(id);
  };

  const goBack = () => {
    if (active && window.history.state?.nexrideSettingsDetail === active) {
      setActive(null);
      window.history.back();
    } else {
      setActive(null);
    }
  };

  return <div className="nr-settings-groups" data-screen={active ? "detail" : "home"}>
    <nav className="nr-settings-home" aria-label={homeLabel} hidden={active !== null}>
      {groups.map(group => <div className="nr-settings-group" key={group.id}>
        <div className="nr-settings-group-heading">
          <button type="button" onClick={() => open(group.id)} aria-label={group.title + ". " + group.summary}>
            <span className="nr-settings-group-icon"><Icon name={group.icon} size={22}/></span>
            <span className="nr-settings-group-label"><strong>{group.title}</strong><small>{group.summary}</small></span>
            <span className="nr-settings-group-chevron"><Icon name="chevron" size={18}/></span>
          </button>
        </div>
      </div>)}
    </nav>
    {groups.map(group => {
      const selected = active === group.id;
      const headingId = `${scope}-${group.id}-heading`;
      return <section key={group.id} className="nr-settings-detail" hidden={!selected}
        data-section={group.id} aria-labelledby={headingId}>
        <header className="nr-settings-detail-header">
          <button className="nr-settings-back" type="button" aria-label={backLabel} onClick={goBack}>
            <Icon name="back" size={21}/><span>{backLabel}</span>
          </button>
          <h2 ref={selected ? heading : undefined} id={headingId} tabIndex={-1}>{group.title}</h2>
          <p>{group.summary}</p>
        </header>
        <div className="nr-settings-group-content">
          {visited[group.id] ? group.children : null}
        </div>
      </section>;
    })}
  </div>;
}
