/**
 * splitStatements — split a SQL script into statements, respecting
 * quotes, dollar-quoting, and comments. Mirrors the BE splitter so the
 * "run statement at cursor" range matches exactly what the server runs.
 */
export interface SqlStatement {
  sql: string;
  from: number; // char offset of the (trimmed) statement start
  to: number; // char offset just past its end
}

export function splitStatements(input: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let i = 0;
  let start = 0;
  const n = input.length;

  const push = (end: number) => {
    const raw = input.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed) {
      const lead = raw.length - raw.trimStart().length;
      out.push({ sql: trimmed, from: start + lead, to: start + lead + trimmed.length });
    }
    start = end + 1;
  };

  while (i < n) {
    const c = input[i];
    if (c === '-' && input[i + 1] === '-') {
      const nl = input.indexOf('\n', i);
      i = nl < 0 ? n : nl;
      continue;
    }
    if (c === '/' && input[i + 1] === '*') {
      const e = input.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < n) {
        if (input[i] === q) {
          if (input[i + 1] === q) {
            i += 2;
            continue;
          }
          break;
        }
        i++;
      }
      i++;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(input.slice(i));
      if (m) {
        const tag = m[0];
        const e = input.indexOf(tag, i + tag.length);
        i = e < 0 ? n : e + tag.length;
        continue;
      }
    }
    if (c === ';') {
      push(i);
      i++;
      continue;
    }
    i++;
  }
  if (start < n) push(n);
  return out;
}

/** The statement whose range contains `pos` (or the last one). */
export function statementAtCursor(
  doc: string,
  pos: number,
): SqlStatement | null {
  const stmts = splitStatements(doc);
  for (const s of stmts) {
    if (pos >= s.from && pos <= s.to + 1) return s;
  }
  return stmts.length ? stmts[stmts.length - 1] : null;
}
