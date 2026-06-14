// Context menu for card actions (flag, suspend, reschedule, export)

let currentContextMenu = null;

export function showContextMenu(x, y, items) {
    // Close existing menu
    if (currentContextMenu) currentContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    for (const item of items) {
        if (item.type === 'divider') {
            const divider = document.createElement('div');
            divider.className = 'context-menu-divider';
            menu.appendChild(divider);
        } else {
            const menuItem = document.createElement('button');
            menuItem.className = 'context-menu-item';
            menuItem.type = 'button';
            menuItem.setAttribute('role', 'menuitem');

            if (item.icon) {
                const icon = document.createElement('span');
                icon.className = 'context-menu-icon';
                // SVG icon strings are trusted static markup; a bare string stays text.
                if (typeof item.icon === 'string' && item.icon.trimStart().startsWith('<svg')) icon.innerHTML = item.icon;
                else icon.textContent = item.icon;
                menuItem.appendChild(icon);
            }

            const label = document.createElement('span');
            label.textContent = item.label;
            menuItem.appendChild(label);

            if (item.shortcut) {
                const shortcut = document.createElement('span');
                shortcut.className = 'context-menu-shortcut';
                shortcut.textContent = item.shortcut;
                menuItem.appendChild(shortcut);
            }

            menuItem.addEventListener('click', () => {
                item.action();
                closeContextMenu();
            });

            menuItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.action();
                    closeContextMenu();
                }
            });

            menu.appendChild(menuItem);
        }
    }

    document.body.appendChild(menu);
    currentContextMenu = menu;

    // Position menu to stay within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }

    // Focus first item for keyboard nav
    const firstItem = menu.querySelector('.context-menu-item');
    if (firstItem) firstItem.focus();

    // Close menu on click outside
    document.addEventListener('click', closeContextMenuOnClickOutside, true);
}

// Bind a context menu to an element on BOTH right-click and touch long-press,
// so every menu is reachable on phones/tablets (where `contextmenu` does not
// fire reliably) and not only on desktop pointers. `itemsFor(e)` returns the
// items array; the coords come from the triggering pointer/touch. Single shared
// helper instead of a bespoke fallback per call site (composition spine).
const LONG_PRESS_MS = 500;
export function bindContextMenu(elm, itemsFor) {
    elm.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, itemsFor(e));
    });
    let timer = null, startX = 0, startY = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    elm.addEventListener('touchstart', (e) => {
        const t = e.touches[0]; if (!t) return;
        startX = t.clientX; startY = t.clientY;
        clear();
        timer = setTimeout(() => {
            timer = null;
            if (navigator.vibrate) navigator.vibrate(10);
            showContextMenu(startX, startY, itemsFor(e));
        }, LONG_PRESS_MS);
    }, { passive: true });
    // Any movement beyond a small slop or lift cancels the long-press (it was a
    // scroll/tap, not a press-and-hold).
    elm.addEventListener('touchmove', (e) => {
        const t = e.touches[0]; if (!t) return;
        if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) clear();
    }, { passive: true });
    elm.addEventListener('touchend', clear, { passive: true });
    elm.addEventListener('touchcancel', clear, { passive: true });
}

function closeContextMenuOnClickOutside(e) {
    if (currentContextMenu && !currentContextMenu.contains(e.target)) {
        closeContextMenu();
    }
}

export function closeContextMenu() {
    if (currentContextMenu) {
        currentContextMenu.remove();
        currentContextMenu = null;
    }
    document.removeEventListener('click', closeContextMenuOnClickOutside, true);
}

// Keyboard nav: Escape closes, arrow keys navigate
document.addEventListener('keydown', (e) => {
    if (!currentContextMenu) return;

    if (e.key === 'Escape') {
        e.preventDefault();
        closeContextMenu();
        return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(currentContextMenu.querySelectorAll('.context-menu-item'));
        if (!items.length) return; // divider-only menu: nothing focusable, avoid %0 -> NaN index
        const current = currentContextMenu.querySelector(':focus');
        const currentIndex = items.indexOf(current);

        let nextIndex;
        if (e.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % items.length;
        } else {
            nextIndex = (currentIndex - 1 + items.length) % items.length;
        }

        items[nextIndex].focus();
    }
});
