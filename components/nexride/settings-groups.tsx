"use client";

import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { registerNexRideBackHandler } from "../../lib/nexride-native-navigation";
import { Icon, LanguageContext, type IconName } from "./ui";
import "./settings-groups.css";

type SettingsGroup = { id: string; title: string; summary: string; icon: IconName; children: ReactNode };

/** Visited detail screens stay mounted so navigating back never discards drafts. */
export function SettingsGroups({ groups }: { groups: SettingsGroup[] }) {
  const scope = useId();
  const language = useContext(LanguageContext);
  const [open, setOpen] = useState<string | null>(null);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const root = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const activeId = useRef<string | null>(null);
  activeId.current = open;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const restore = () => {
      const id = window.location.hash.replace('#settings-', '');
      const next = groups.some(group => group.id === id) ? id : null;
      if (next) setVisited(value => ({ ...value, [next]: true }));
      setOpen(next);
    };
    restore(); window.addEventListener('popstate', restore);
    const unregister = registerNexRideBackHandler(() => {
      if (!activeId.current) return false;
      window.history.back(); return true;
    }, 100);
    return () => {
      unregister(); window.removeEventListener('popstate', restore);
    };
  }, []);
  useEffect(() => {
    if (open) { heading.current?.focus(); root.current?.scrollIntoView({ block: 'start' }); }
    else if (last.current) root.current?.querySelector<HTMLButtonElement>(`[data-category="${last.current}"]`)?.focus();
    last.current = open;
  }, [open]);
  const active = groups.find(group => group.id === open);
  return <div className="nr-settings-groups" ref={root} data-detail={!!active}>
    <div className="nr-settings-home" hidden={!!active}>
      <p className="nr-settings-intro">{language === 'am' ? 'ለእርስዎ የተመቸ NexRide።' : 'Make NexRide feel like you.'}</p>
      <nav aria-label={language === 'am' ? 'ቅንብሮች' : 'Settings categories'}>
        {groups.map(group => <button className="nr-settings-category" type="button" key={group.id} data-category={group.id}
          onClick={() => { setVisited(value => ({ ...value, [group.id]: true })); setOpen(group.id); window.history.pushState(window.history.state, '', `#settings-${group.id}`); }}>
          <Icon name={group.icon} size={23}/>
          <span className="nr-settings-group-label"><strong>{group.title}</strong><small>{group.summary}</small></span>
          <Icon name="chevron" size={18}/>
        </button>)}
      </nav>
    </div>
    {active && <header className="nr-settings-detail-head">
      <button type="button" className="nr-settings-back" onClick={() => window.history.back()} aria-label={language === 'am' ? 'ወደ ቅንብሮች ተመለስ' : 'Back to Settings'}><span><Icon name="arrow" size={21}/></span>{language === 'am' ? 'ቅንብሮች' : 'Settings'}</button>
      <h2 ref={heading} tabIndex={-1} id={`${scope}-title`}>{active.title}</h2><p>{active.summary}</p>
    </header>}
    {groups.map(group => <section key={group.id} className="nr-settings-group-content" role="region" aria-label={group.title} hidden={open !== group.id}>
      {visited[group.id] ? group.children : null}
    </section>)}
  </div>;
}

export function SettingsEditor({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const language = useContext(LanguageContext);
  const [editing, setEditing] = useState(false);
  return <div className="nr-settings-editor">
    <button type="button" className="nr-settings-category" aria-expanded={editing} onClick={() => setEditing(!editing)}>
      <span className="nr-settings-group-label"><strong>{title}</strong><small>{summary}</small></span><Icon name={editing ? 'close' : 'chevron'} size={18}/>
    </button>
    <div hidden={!editing} className="nr-settings-edit-content">{children}<button type="button" className="nr-settings-done" onClick={() => setEditing(false)}>{language === 'am' ? 'ተጠናቋል' : 'Done editing'}</button></div>
  </div>;
}
