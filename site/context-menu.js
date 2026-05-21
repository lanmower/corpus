// Context menu for card actions (flag, suspend, reschedule, export)

let currentContextMenu = null;

export function showContextMenu(x, y, items) {
    // Close existing menu
    if (currentContextMenu) currentContextMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
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

            if (item.icon) {
                const icon = document.createElement('span');
                icon.className = 'context-menu-icon';
                icon.textContent = item.icon;
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
