// commands most visitors never run: their help is here, their code loads the first time someone runs them
import { QR_PAGES } from '../content.js';
import { def, completes } from '../registry.js';

const later = (file, fn) => async (...args) => (await import(file))[fn](...args);

def(['python', 'python3', 'py'], 'fun', 'a tiny Python (my first language)', later('./python.js', 'python'),
  { usage: '[-c code]', version: true, flags: [['-c code', 'run code and exit, like python -c "print(2**10)"'], ['-V, --version', 'the version']] });
def(['calc', 'bc'], 'more', 'a calculator (the same tiny Python)', later('./python.js', 'calc'),
  { usage: '<expression>', flags: [['expression', 'like 2**10, 0xff + 1, math.sqrt(2) or 7 // 2']] });
def('qr', 'me', 'a QR code, to open a page on your phone', later('./qr.js', 'qr'),
  { usage: '[page|text]', flags: [['terminal', 'this terminal (the default)'], ['site, linkedin, github, repo, cv, rss', 'my pages'], ['text', 'any link or text, like qr https://example.com']] });
completes('qr', args => args.length ? null : Object.keys(QR_PAGES()));
// the guestbook is switched off until its backend runs (see js/commands/guestbook.js and the README): no command,
// no help line, no Tab completion. Set this to true once PROFILE.guestbook points at a working endpoint
const GUESTBOOK = false;
if (GUESTBOOK) {
  def('guestbook', 'me', 'read or sign the guestbook', later('./guestbook.js', 'guestbook'),
    { usage: '[sign]', flags: [['sign', 'leave a message yourself']] });
  completes('guestbook', args => args.length ? null : ['sign']);
}
