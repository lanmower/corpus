// Clipboard copy with an execCommand fallback for insecure contexts where
// navigator.clipboard is unavailable. A pure leaf: the only collaborator is the
// toast surface, passed in via the ok/fail message args. Extracted from app.js
// so the degradation path lives in one place instead of inline at call sites.
import * as toast from './toast.js';

export function copyToClipboard(text, ok, fail) {
    const done = () => { if (ok) toast.show(ok); };
    const failed = () => { if (fail) toast.show(fail); };
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done, failed));
            return;
        }
    } catch {}
    fallbackCopy(text, done, failed);
}

export function fallbackCopy(text, done, failed) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const okExec = document.execCommand('copy');
        ta.remove();
        if (okExec) done(); else failed();
    } catch { failed(); }
}
