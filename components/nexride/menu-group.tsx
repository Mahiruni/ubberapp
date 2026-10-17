"use client";
import { useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./ui";
export function MenuGroup({label,icon,children,initiallyOpen=false,active=false}:{
  label:string; icon:IconName; children:ReactNode; initiallyOpen?:boolean; active?:boolean;
}) {
  const [expanded,setExpanded]=useState(initiallyOpen||active);
  const id=useId();
  return <section className="nr-menu-group" data-expanded={expanded?"true":"false"} data-active={active?"true":"false"}>
    <button type="button" className="nr-menu-group-toggle" aria-expanded={expanded} aria-controls={id}
      onClick={()=>setExpanded(value=>!value)}>
      <span className="nr-menu-group-leading"><Icon name={icon} size={20}/></span>
      <span>{label}</span><span className="nr-menu-group-chevron"><Icon name="chevron" size={18}/></span>
    </button>
    <div id={id} className="nr-menu-group-content" hidden={!expanded}>{children}</div>
  </section>;
}
