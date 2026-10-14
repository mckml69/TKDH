import React, { useEffect } from "react";
import { Cat, ThumbsUp } from "lucide-react";
import { DICKY_VISITS } from "../../lib/dicky";

/** A small, brief card from Dicky at the bottom of the screen. It never blocks anything (only the card itself can be
    clicked, to dismiss it early) and goes away by itself. kind: "approves" or "pest" (see DICKY_VISITS). */
export function DickyMessage({ kind = "approves", onDone }) {
  const visit = DICKY_VISITS[kind] || DICKY_VISITS.approves;
  useEffect(() => {
    const t = setTimeout(onDone, visit.ms);
    return () => clearTimeout(t);
  }, [onDone, visit.ms]);
  const Icon = kind === "pest" ? Cat : ThumbsUp;
  return (
    <div className="dicky-wrap" aria-live="polite">
      <button type="button" className="dicky-card" onClick={onDone} aria-label={visit.text + ". Dismiss."}>
        <span className="dicky-badge"><Icon size={26} strokeWidth={2.2} /></span>
        <span className="dicky-text">{visit.text}</span>
      </button>
    </div>
  );
}
