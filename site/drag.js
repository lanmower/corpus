// Drag & drop functionality for flashcards and guide sections

export function makeDraggable(element, dragClass = 'draggable', dragImageClass = 'drag-image') {
    element.draggable = true;
    element.classList.add(dragClass);

    element.addEventListener('dragstart', (e) => {
        element.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';

        // Create drag image (copy of the element with reduced opacity)
        const dragImage = element.cloneNode(true);
        dragImage.classList.add(dragImageClass);
        dragImage.style.position = 'fixed';
        dragImage.style.pointerEvents = 'none';
        dragImage.style.zIndex = '9999';
        dragImage.style.top = '-9999px';
        dragImage.style.left = '-9999px';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);

        // Clean up drag image after drag ends
        setTimeout(() => dragImage.remove(), 0);

        // Store data for drops
        e.dataTransfer.setData('application/json', JSON.stringify({
            id: element.dataset.cardId,
            type: 'card'
        }));
    });

    element.addEventListener('dragend', (e) => {
        element.classList.remove('dragging');
    });
}

export function makeDropZone(element, onDrop, dropZoneClass = 'drop-zone-active') {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        element.classList.add(dropZoneClass);
    });

    element.addEventListener('dragleave', (e) => {
        if (e.target === element) {
            element.classList.remove(dropZoneClass);
        }
    });

    element.addEventListener('drop', (e) => {
        e.preventDefault();
        element.classList.remove(dropZoneClass);

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            onDrop(data);
        } catch (err) {
            console.warn('[drag] drop handler failed:', err);
        }
    });
}

export function showLoadingSpinner(container, message = 'loading...') {
    const spinner = document.createElement('div');
    spinner.className = 'loading-text';
    spinner.innerHTML = `<div class="loading-spinner"></div><span>${message}</span>`;
    container.appendChild(spinner);
    return spinner;
}

export function showLoadingState(element, cardCount = null) {
    element.classList.add('is-loading');
    const msg = cardCount ? `loading ${cardCount} card${cardCount > 1 ? 's' : ''}...` : 'loading...';
    showLoadingSpinner(element, msg);
}

export function hideLoadingState(element) {
    element.classList.remove('is-loading');
    const spinner = element.querySelector('.loading-text');
    if (spinner) spinner.remove();
}
