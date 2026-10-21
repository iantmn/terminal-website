// the building blocks of the trees outside ~: folders and files owned by root unless they say otherwise
import { esc } from '../core.js';

export const dir = (children, extra = {}) => ({ type: 'dir', children, own: 'root', ...extra });
// a file from lines (plain text, escaped here) or from a function that returns html lines
export const file = (lines, extra = {}) => ({ type: 'file', own: 'root', read: typeof lines === 'function' ? lines : () => lines.map(l => l.startsWith('<span') ? l : esc(l)), ...extra });
export const locked = (children, extra = {}) => dir(children, { locked: true, mode: () => 'drwx------', ...extra });
