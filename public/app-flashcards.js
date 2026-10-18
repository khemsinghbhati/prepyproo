/* Flashcard create, edit, and reorder workflows */
Object.assign(window.app, {
    showFlashcardForm(card = null) {
        editingFlashcardId = card ? card.id : null;
        app.tempImageUrl = card?.img || '';
        const html = `
            <div class="space-y-6">
                <div><label class="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Front (Question)</label>
                <textarea id="fc-front" rows="2" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none font-bold text-lg shadow-inner">${this.escapeHTML(card?.front || '')}</textarea></div>
                <div><label class="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Back (Answer) <span class="text-slate-600">- Optional if image</span></label>
                <textarea id="fc-back" rows="3" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none font-medium shadow-inner placeholder-slate-700" placeholder="Type answer details here...">${this.escapeHTML(card?.back || '')}</textarea></div>
                <div class="bg-slate-950/50 p-5 rounded-2xl border border-slate-800">
                    <label class="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Attach / Ctrl+V</label>
                    <input type="file" accept="image/*" onchange="app.handleImageUpload(event)" class="w-full text-sm text-slate-400 file:mr-4 file:py-3 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-black file:tracking-widest file:uppercase file:bg-blue-600 file:text-white hover:file:bg-blue-500 transition-all cursor-pointer mb-5">
                    <div class="flex items-center gap-4 mb-4"><div class="h-px bg-slate-800 flex-1"></div><span class="text-[10px] text-slate-600 font-black uppercase tracking-widest">OR PASTE URL</span><div class="h-px bg-slate-800 flex-1"></div></div>
                    <input type="text" id="img-url-input" value="${this.escapeHTML(card?.img || '')}" placeholder="https://..." oninput="app.handleImageUrl(this.value)" class="w-full px-5 py-3.5 rounded-xl border border-slate-700 bg-slate-900 text-white focus:border-blue-500 outline-none font-mono text-sm shadow-inner">
                    <div id="img-preview">${this.safeImageURL(card?.img) ? `<img src="${this.safeImageURL(card.img)}" alt="Flashcard attachment" class="max-h-40 object-contain rounded-xl shadow-lg border border-slate-700 mt-4 bg-slate-950 p-2">` : ''}</div>
                </div>
                <button onclick="app.saveFlashcard()" class="w-full py-4 bg-blue-600 text-white font-black tracking-widest uppercase text-sm rounded-xl hover:bg-blue-500 transition shadow-[0_4px_0_0_#1e3a8a] active:translate-y-1 mt-6 border border-blue-500">${card ? 'Update Flashcard' : 'Save Flashcard'}</button>
            </div>`;
        this.showModal(card ? "Edit Flashcard" : "New Flashcard", html);
    },
    editFlashcard(cardId) {
        const stData = this.findSubtopic(activeSubtopicId);
        const card = stData?.subtopic.flashcards.find(x => x.id === cardId);
        if (card) this.showFlashcardForm(card);
    },
    moveFlashcard(index, direction) {
        const stData = this.findSubtopic(activeSubtopicId);
        if (!stData) return;
        const cards = stData.subtopic.flashcards;
        const target = index + direction;
        if (index < 0 || index >= cards.length || target < 0 || target >= cards.length) return;
        [cards[index], cards[target]] = [cards[target], cards[index]];
        this.save();
        this.setView('subtopic-editor');
        this.showToast(direction < 0 ? "Flashcard moved up." : "Flashcard moved down.", "success");
    },
    saveFlashcard() {
        const front = document.getElementById('fc-front').value.trim();
        const back = document.getElementById('fc-back').value.trim();
        if (app.imageUploadInProgress) return this.showToast("Please wait for the image upload to finish.", "error");
        if (!front) return alert("Front text is required.");
        if (!back && !app.tempImageUrl) return alert("Please provide either Back text or an Image.");
        const stData = this.findSubtopic(activeSubtopicId);
        if (!stData) return this.showToast("Subtopic not found.", "error");
        if (editingFlashcardId) {
            const card = stData.subtopic.flashcards.find(x => x.id === editingFlashcardId);
            if (card) Object.assign(card, { front, back, img: app.tempImageUrl });
        } else {
            stData.subtopic.flashcards.push({ id: generateId(), front, back, img: app.tempImageUrl });
        }
        editingFlashcardId = null;
        app.tempImageUrl = '';
        this.save(); this.closeModal(); this.setView('subtopic-editor');
        this.showToast("Flashcard saved.", "success");
    },

});
