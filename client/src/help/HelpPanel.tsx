import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CloseIcon, HelpIcon } from "../components/IconToolbar";
import { useExternalStats } from "../extensions/externalStats";
import { useEscapeLayer } from "../state/useEscapeLayer";
import { HELP_GUIDES } from "./guides";
import { buildHelpIndex, questionTokens, searchHelp } from "./search";
import { helpStatSections, statisticsGuide } from "./statistics";
import { sortTopics } from "./topics";
import type { HelpGuide, HelpPage } from "./types";

/** Which page Help is opened over, for its "This page" list (<help_this_page>). */
const PAGE_BY_PATH: Record<string, HelpPage> = {
  "/": "dashboard",
  "/players": "player-explorer",
  "/teams": "team-explorer",
  "/player-comparison": "player-comparison",
  "/team-building": "team-building",
};

/** A guide about this page in particular, not one that applies on every page. */
function isAbout(guide: HelpGuide, page: HelpPage | undefined): boolean {
  return !!page && !!guide.pages && guide.pages.includes(page) && guide.pages.length < 5;
}

/** The best match opens by itself once a question is long enough to mean something (a letter or two narrows the list, nothing more). */
const OPEN_BEST_FROM = 3;

function GuideCard({ guide, open, question, onToggle, onRelated, byId }: {
  guide: HelpGuide;
  open: boolean;
  question: string;
  onToggle: () => void;
  onRelated: (id: string) => void;
  byId: Map<string, HelpGuide>;
}) {
  const related = (guide.related ?? []).map((id) => byId.get(id)).filter((g): g is HelpGuide => !!g);
  return (
    <div className={`help-card${open ? " open" : ""}`}>
      <button type="button" className="help-card-head" aria-expanded={open} onClick={onToggle}>
        <span className="help-card-title">{guide.title}</span>
        <span className="help-card-answer">{guide.answer}</span>
      </button>
      {open && (
        <div className="help-card-body">
          {typeof guide.body === "function" ? guide.body(question) : guide.body}
          {related.length > 0 && (
            <div className="help-related">
              {related.map((g) => (
                <button key={g.id} type="button" className="help-related-link" onClick={() => onRelated(g.id)}>
                  {g.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * <help_panel>: the top bar's Help, opened by the magnifying glass beside
 * the colour switch. It slides in like the Notepad (the shared side panel,
 * one at a time) with a box to ask in your own words. Show all to show
 * none (<help_search>): with nothing typed every guide is listed (this
 * page's first, then by topic), and each letter typed narrows the list to
 * the guides it still matches, best first; the best opens by itself once
 * the question has a few letters. The question stays as left between opens.
 */
export function HelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ext = useExternalStats();
  const { pathname } = useLocation();
  const page = PAGE_BY_PATH[pathname];
  const [question, setQuestion] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEscapeLayer(open, onClose);

  // A second source works out its columns' figures when asked for them, so the Statistics guide is made only once Help has been opened.
  const [used, setUsed] = useState(false);
  useEffect(() => {
    if (open) setUsed(true);
  }, [open]);
  const guides = useMemo(
    () => [...HELP_GUIDES, ...(ext?.helpGuides ?? []), ...(used ? [statisticsGuide(helpStatSections(ext))] : [])],
    [ext, used],
  );
  const byId = useMemo(() => new Map(guides.map((g) => [g.id, g])), [guides]);
  const index = useMemo(() => buildHelpIndex(guides), [guides]);
  const asking = questionTokens(question).length > 0;
  const results = useMemo(() => (asking ? searchHelp(index, question) : []), [index, question, asking]);

  const ask = (text: string) => {
    setQuestion(text);
    const best = text.trim().length >= OPEN_BEST_FROM ? searchHelp(index, text)[0] : undefined;
    setOpenIds(new Set(best ? [best.guide.id] : []));
    listRef.current?.scrollTo?.({ top: 0 });
  };
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const showGuide = (id: string) => {
    const g = byId.get(id);
    if (!g) return;
    setQuestion(g.title);
    setOpenIds(new Set([id]));
    listRef.current?.scrollTo?.({ top: 0 });
  };

  // As the Notepad does: opening puts the cursor in the box, closing hands focus back if it was inside.
  useEffect(() => {
    if (open) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
      return;
    }
    if (panelRef.current?.contains(document.activeElement)) {
      const previous = returnFocusTo.current;
      if (previous && previous.isConnected && !panelRef.current.contains(previous)) previous.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [open]);

  const card = (g: HelpGuide) => (
    <GuideCard key={g.id} guide={g} open={openIds.has(g.id)} question={question} onToggle={() => toggle(g.id)} onRelated={showGuide} byId={byId} />
  );

  let list: React.ReactNode;
  if (!asking) {
    // The guides only about this page first, then those it shares with others (Team Building's own before the table's).
    const here = guides.filter((g) => isAbout(g, page)).sort((a, b) => (a.pages?.length ?? 0) - (b.pages?.length ?? 0));
    list = (
      <>
        {here.length > 0 && (
          <section className="help-group">
            <h3 className="help-group-title">This page</h3>
            {here.map(card)}
          </section>
        )}
        {sortTopics([...new Set(guides.map((g) => g.topic))]).map((t) => (
          <section className="help-group" key={t}>
            <h3 className="help-group-title">{t}</h3>
            {guides.filter((g) => g.topic === t).map(card)}
          </section>
        ))}
      </>
    );
  } else if (results.length === 0) {
    list = <div className="help-empty">Nothing matches "{question.trim()}".</div>;
  } else {
    list = results.map((r) => card(r.guide));
  }

  return (
    <div className={`side-layer${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="side-dim" />
      <div className="side-panel help-panel" ref={panelRef} role="dialog" aria-modal="false" aria-label="Help">
        <div className="side-panel-header">
          <div className="side-panel-heading">
            <HelpIcon />
            <span className="side-panel-title">Help</span>
          </div>
          <div className="side-panel-actions">
            <button type="button" className="chip chip-icon" title="Close help (Esc)" aria-label="Close help" onClick={onClose}>
              <CloseIcon size={14} />
            </button>
          </div>
        </div>
        <div className="help-search">
          <HelpIcon size={14} />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => ask(e.target.value)}
            placeholder="Ask a question, or name a statistic"
            aria-label="Ask a question, or name a statistic"
            autoComplete="off"
            spellCheck={false}
          />
          {question && (
            <button type="button" className="help-search-clear" title="Clear" aria-label="Clear the question" onClick={() => ask("")}>
              <CloseIcon size={12} />
            </button>
          )}
        </div>
        <div className="help-list" ref={listRef}>
          {list}
        </div>
      </div>
    </div>
  );
}
