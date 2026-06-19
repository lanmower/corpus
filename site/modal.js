// Async confirmation modal — keyboard-navigable (Tab/Enter/Escape), no native confirm().
// Usage: const ok = await confirmModal('message');
export function confirmModal(msg) {
    return new Promise(resolve => {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.setAttribute('role', 'dialog');
        backdrop.setAttribute('aria-modal', 'true');
        backdrop.setAttribute('aria-label', 'confirm');

        const box = document.createElement('div');
        box.className = 'modal-box';

        const text = document.createElement('p');
        text.className = 'modal-msg';
        text.textContent = msg;

        const btnRow = document.createElement('div');
        btnRow.className = 'modal-btns';

        const okBtn = document.createElement('button');
        okBtn.className = 'chip modal-ok';
        okBtn.textContent = 'confirm';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'chip modal-cancel';
        cancelBtn.textContent = 'cancel';

        btnRow.append(cancelBtn, okBtn);
        box.append(text, btnRow);
        backdrop.append(box);
        document.body.append(backdrop);

        function close(result) {
            backdrop.removeEventListener('keydown', onKey);
            backdrop.remove();
            resolve(result);
        }

        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
            if (e.key === 'Enter' && document.activeElement === okBtn) { e.preventDefault(); close(true); }
            if (e.key === 'Tab') {
                e.preventDefault();
                if (document.activeElement === okBtn) cancelBtn.focus();
                else okBtn.focus();
            }
        }

        okBtn.addEventListener('click', () => close(true));
        cancelBtn.addEventListener('click', () => close(false));
        backdrop.addEventListener('keydown', onKey);
        // Click outside box closes as cancel
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(false); });

        // Focus confirm button after a tick so the opening click doesn't immediately fire it
        requestAnimationFrame(() => { backdrop.setAttribute('tabindex', '-1'); okBtn.focus(); });
    });
}
