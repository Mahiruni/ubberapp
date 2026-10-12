"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./ui";
import "./settings-groups.css";

type SettingsGroup = {
  id: string;
  title: string;
  summary: string;
  icon: IconName;
  children: ReactNode;
};

/** Show one section at a time. Keep visited sections mounted so switching
 * groups preserves profile drafts, feedback and device preference state. */
export function SettingsGroups({ groups }: { groups: SettingsGroup[] }) {
  const scope = useId();
  const [open, setOpen] = useState<string | null>(null);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  return <div className="nr-settings-groups">
    {groups.map(group => {
      const expanded = open === group.id;
      const heading = `${scope}-${group.id}-heading`;
      const content = `${scope}-${group.id}-content`;
      return <section className="nr-settings-group" key={group.id} data-open={expanded}>
        <h2 className="nr-settings-group-heading">
          <button type="button" id={heading} aria-expanded={expanded} aria-controls={content}
            onClick={() => {
              setVisited(value => ({ ...value, [group.id]: true }));
              setOpen(value => value === group.id ? null : group.id);
            }}>
            <span className="nr-settings-group-icon"><Icon name={group.icon} size={20}/></span>
            <span className="nr-settings-group-label"><strong>{group.title}</strong><small>{group.summary}</small></span>
            <span className="nr-settings-group-chevron"><Icon name="chevron" size={18}/></span>
          </button>
        </h2>
        <div className="nr-settings-group-content" id={content} role="region" aria-labelledby={heading} hidden={!expanded}>
          {visited[group.id] ? group.children : null}
        </div>
      </section>;
    })}
  </div>;
}
