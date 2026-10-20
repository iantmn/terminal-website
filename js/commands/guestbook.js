// guestbook: read the latest messages, or leave one.
// The page is static, so the messages live behind PROFILE.guestbook, a small JSON endpoint (an n8n webhook works):
//   GET  <url>  -> [{ "name": "...", "message": "...", "date": "2026-10-20T20:52:00Z" }, ...]  newest first, 20 at most
//   POST <url>  with { "name": "...", "message": "..." }  -> 200 { "ok": true }, or 4xx/429 { "error": "..." }
// The endpoint has to allow this site in CORS, check lengths again, rate-limit and moderate; this file trusts nothing it gets back.
import { print, printLines, span, esc, cmd, ask, store, state, inrow } from '../core.js';
import { PROFILE } from '../content.js';

const MAX_NAME = 30, MAX_MESSAGE = 200;
const closed = () => print(span('m', 'The guestbook is not open yet. Until then: ') + cmd('contact'));
const today = () => new Date().toISOString().slice(0, 10);
// a name and message as plain text on one line: no html, no control characters, no links
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const hasLink = s => /(https?:\/\/|www\.|\b[\w-]+\.(com|nl|net|org|io|ru|xyz)\b)/i.test(s);

async function read() {
  if (!PROFILE.guestbook) return closed();
  print(span('m', 'fetching the guestbook ...'));
  let entries;
  try {
    const res = await fetch(PROFILE.guestbook, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw 0;
    entries = await res.json();
    if (!Array.isArray(entries)) throw 0;
  } catch { return print(span('e', 'guestbook: could not reach it right now, try again later.')); }
  if (!entries.length) return print(span('m', 'Nobody signed yet. Be the first: ') + cmd('guestbook sign'));
  printLines(entries.slice(0, 20).flatMap(e => {
    const d = new Date(e.date);
    return [`${span('a2 b', esc(clean(e.name, MAX_NAME) || 'anonymous'))} ${span('m', isNaN(d) ? '' : d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }))}`, '  ' + esc(clean(e.message, MAX_MESSAGE)), ''];
  }));
  print(span('m', 'Leave one yourself: ') + cmd('guestbook sign'));
}

async function sign() {
  if (!PROFILE.guestbook) return closed();
  if (state.capture) return print(span('e', 'guestbook: signing needs a real keyboard, not a pipe'));
  if (store.get('guestbookSigned') === today()) return print(span('m', 'You already signed today, thanks! Come back tomorrow for another one.'));
  state.busy = false; inrow.style.visibility = '';
  const name = clean(await ask(span('w', `Your name (max ${MAX_NAME}, empty for anonymous): `)), MAX_NAME);
  const message = clean(await ask(span('w', `Your message (max ${MAX_MESSAGE}): `)), MAX_MESSAGE);
  if (!message) return print(span('m', 'No message, nothing signed.'));
  if (hasLink(name + ' ' + message)) return print(span('e', 'guestbook: no links, please.') + span('m', ' Words only.'));
  print(span('m', 'This will be public: ') + span('a2', esc(name || 'anonymous')) + span('m', ': ') + esc(message));
  const ok = await ask(span('w', 'Sign the guestbook? [y/N] '));
  if (!/^y(es)?$/i.test(ok || '')) return print(span('m', 'Not signed.'));
  state.busy = true; inrow.style.visibility = 'hidden';
  try {
    const res = await fetch(PROFILE.guestbook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, message }), signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      let why = '';
      try { why = clean((await res.json()).error, 120); } catch {}
      return print(span('e', `guestbook: not signed (${res.status === 429 ? 'too many messages, try later' : esc(why || 'the server said no')}).`));
    }
  } catch { return print(span('e', 'guestbook: could not reach it right now, nothing was signed.')); }
  store.set('guestbookSigned', today());
  print(span('a', 'Signed, thank you!') + span('m', ' It shows up once I had a look at it.'));
}

export const guestbook = args => args[0] === 'sign' ? sign() : read();
