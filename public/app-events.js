document.addEventListener('paste', (event) => {
    const hasImage = Array.from(event.clipboardData?.items || [])
        .some(item => item.type.startsWith('image/'))
        || Array.from(event.clipboardData?.files || [])
            .some(file => file.type.startsWith('image/'));
    if (!hasImage) return;

    const modal = document.getElementById('modal-container');
    if (!modal || modal.classList.contains('hidden') || !document.getElementById('img-preview')) return;

    event.preventDefault();
    window.app.handleImageUpload(event);
});
