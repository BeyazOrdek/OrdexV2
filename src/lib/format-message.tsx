import type { ReactNode } from "react";
import { Fragment } from "react";

// ---------- 💬 ÖRDEX message formatting: **kalın**, *italik*, `kod`, ||spoiler|| ----------

/** Bare http(s) link detector (used after the inline marks are consumed). */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Render plain text with bare URLs converted to links. */
function renderPlain(piece: string, keyPrefix: string): ReactNode[] {
  const parts = piece.split(URL_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (URL_RE.test(part) && part.startsWith("http")) {
      URL_RE.lastIndex = 0;
      return (
        <a
          key={`${keyPrefix}-l${i}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-[var(--ordex-accent)] underline decoration-[var(--ordex-accent)]/40 underline-offset-2 hover:decoration-[var(--ordex-accent)]"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    URL_RE.lastIndex = 0;
    return <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>;
  });
}

/** One inline formatting span — order matters: spoiler, code, bold, italic. */
const INLINE_RE = /(\|\|[\s\S]+?\|\|)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)/g;

/**
 * Renders chat text with Discord-style inline formatting. Output is plain
 * React nodes (never dangerouslySetInnerHTML), so injection is safe.
 * Supported: **bold**, *italic*, `code`, ||spoiler||, bare URLs → links.
 */
export function renderFormattedMessage(text: string): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(...renderPlain(text.slice(last, idx), `p${k++}`));
    const [full, spoiler, code, bold, italic] = m;
    if (spoiler) {
      out.push(
        <span
          key={`s${k++}`}
          className="ordex-spoiler"
          title="Spoiler — görmek için tıkla"
          onClick={(e) => {
            const el = e.currentTarget;
            el.classList.add("ordex-spoiler-open");
            e.stopPropagation();
          }}
        >
          {spoiler.slice(2, -2) || "spoiler"}
        </span>,
      );
    } else if (code) {
      out.push(
        <code
          key={`c${k++}`}
          className="ordex-inset rounded border border-white/10 px-1 py-0.5 font-mono text-[0.85em] text-zinc-200"
        >
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      out.push(
        <strong key={`b${k++}`} className="font-bold text-white">
          {bold.slice(2, -2)}
        </strong>,
      );
    } else if (italic) {
      out.push(
        <em key={`i${k++}`} className="italic">
          {italic.slice(1, -1)}
        </em>,
      );
    }
    last = idx + full.length;
  }
  if (last < text.length) out.push(...renderPlain(text.slice(last), `p${k++}`));
  return out;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split text into highlight segments for chat search. Case-insensitive;
 * `query` shorter than 2 chars returns the text unsplit.
 */
export function splitHighlight(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim();
  if (q.length < 2) return [{ text, hit: false }];
  const re = new RegExp(escapeRe(q), "gi");
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx), hit: false });
    out.push({ text: m[0], hit: true });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}
