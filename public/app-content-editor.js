/* Subtopic and question-set editor workflows */
Object.assign(window.app, {
    renderSubtopicEditor(container) {
        const stData = this.findSubtopic(activeSubtopicId);
        if (!stData) return;
        const st = stData.subtopic;

        let html = `
            <div class="max-w-6xl mx-auto">
                <div class="mb-10 p-8 bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl">
                    <h1 class="text-4xl font-black text-white tracking-tight">${this.escapeHTML(st.name)}</h1>
                    <p class="text-slate-500 font-bold mt-2 uppercase tracking-widest text-xs">Manage Flashcards & Question Sets</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- Flashcards Section -->
                    <div class="bg-slate-900 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[700px]">
                        <div class="p-6 border-b border-slate-800 flex items-center justify-between bg-blue-900/10">
                            <h3 class="font-extrabold text-xl flex items-center gap-3 text-white"><i class="ph-fill ph-cards text-blue-400 text-2xl"></i> Flashcards <span class="bg-slate-800 text-slate-400 px-3 py-1 rounded-lg text-xs tracking-widest border border-slate-700">${st.flashcards.length}</span></h3>
                            <button onclick="app.showFlashcardForm()" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white shadow-[0_4px_0_0_#1e3a8a] active:translate-y-1 rounded-xl text-xs font-black tracking-widest uppercase transition-all">+ Add Card</button>
                        </div>
                        <div class="p-5 flex-1 overflow-y-auto space-y-4 bg-slate-950/50">
        `;
        if(st.flashcards.length === 0) html += `<div class="text-center py-12 text-slate-600 text-xs font-black tracking-widest uppercase border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">No flashcards yet.</div>`;
        st.flashcards.forEach((fc, idx) => {
            html += `
                <div class="p-6 rounded-2xl border border-slate-800 bg-slate-900 relative group shadow-lg hover:border-slate-600 transition-colors">
                    <div class="absolute top-4 right-4 flex gap-2">
                        <button onclick="app.editFlashcard('${fc.id}')" title="Edit flashcard" aria-label="Edit flashcard" class="text-slate-500 hover:text-blue-400 p-2 bg-slate-950 rounded-lg shadow-sm border border-slate-800 transition-colors"><i class="ph-bold ph-pencil-simple text-lg"></i></button>
                        <button onclick="app.moveFlashcard(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Move up" aria-label="Move flashcard up" class="text-slate-500 hover:text-blue-400 p-2 bg-slate-950 rounded-lg shadow-sm border border-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><i class="ph-bold ph-arrow-up text-lg"></i></button>
                        <button onclick="app.moveFlashcard(${idx}, 1)" ${idx === st.flashcards.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move flashcard down" class="text-slate-500 hover:text-blue-400 p-2 bg-slate-950 rounded-lg shadow-sm border border-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><i class="ph-bold ph-arrow-down text-lg"></i></button>
                        <button onclick="app.deleteItem('fc', ${idx})" title="Delete flashcard" class="text-slate-500 hover:text-red-400 p-2 bg-slate-950 rounded-lg shadow-sm border border-slate-800 transition-colors"><i class="ph-bold ph-trash text-lg"></i></button>
                    </div>
                    <p class="font-extrabold text-base text-white mb-4 pb-4 border-b border-slate-800 leading-relaxed"><span class="text-slate-500 mr-2 uppercase text-xs tracking-widest">Q:</span>${this.escapeHTML(fc.front)}</p>
                    ${this.safeImageURL(fc.img) ? `<img src="${this.safeImageURL(fc.img)}" alt="Flashcard attachment" loading="lazy" class="max-h-48 object-contain my-4 rounded-xl border border-slate-700 bg-slate-950 p-2 w-full shadow-inner">` : ''}
                    ${fc.back ? `<p class="text-sm text-slate-300 line-clamp-4 font-bold leading-relaxed"><span class="text-slate-600 mr-2 uppercase text-xs tracking-widest">A:</span>${this.escapeHTML(fc.back)}</p>` : ''}
                </div>
            `;
        });
        html += `</div></div>`;

        // Question Sets Section
        html += `
                    <div class="bg-slate-900 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[700px]">
                        <div class="p-6 border-b border-slate-800 flex items-center justify-between bg-emerald-900/10">
                            <h3 class="font-black text-xl flex items-center gap-3 text-white"><i class="ph-fill ph-stack text-emerald-400 text-2xl"></i> Question Sets <span class="bg-slate-800 text-slate-400 px-3 py-1 rounded-lg text-xs tracking-widest border border-slate-700">${st.questionSets.length}</span></h3>
                            <button onclick="app.promptInput('New Question Set', 'Set Name', 'app._createSet(val)')" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_4px_0_0_#065f46] active:translate-y-1 rounded-xl text-xs font-black tracking-widest uppercase transition-all">+ New Set</button>
                        </div>
                        <div class="p-5 flex-1 overflow-y-auto space-y-4 bg-slate-950/50">
        `;
        if(st.questionSets.length === 0) html += `<div class="text-center py-12 text-slate-600 text-xs font-black tracking-widest uppercase border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">No sets created yet.</div>`;
        st.questionSets.forEach((set, idx) => {
            html += `
                <div class="p-6 rounded-2xl border border-slate-800 bg-slate-900 shadow-lg flex items-center justify-between group hover:border-emerald-500/50 transition-colors">
                    <div>
                        <h4 class="font-black text-white text-lg">${this.escapeHTML(set.name)}</h4>
                        <p class="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">${set.questions.length} Questions</p>
                    </div>
                    <div class="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onclick="app.renameSet('${set.id}')" title="Rename question set" class="p-2.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg border border-slate-700"><i class="ph-bold ph-pencil-simple"></i></button>
                        <button onclick="app.editSet('${set.id}')" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-black tracking-widest uppercase transition-colors shadow-sm border border-slate-700">Questions</button>
                        <button onclick="app.deleteItem('set', ${idx})" class="p-2.5 bg-slate-950 text-slate-500 hover:text-red-400 border border-slate-800 hover:border-red-500/30 rounded-lg transition-colors"><i class="ph-bold ph-trash text-lg"></i></button>
                    </div>
                </div>
            `;
        });
        html += `</div></div></div></div>`;
        container.innerHTML = html;
    },

    _createSet(name) {
        const stData = this.findSubtopic(activeSubtopicId);
        if (!stData) return;
        stData.subtopic.questionSets.push({ id: generateId(), name, questions: [], history: [] });
        this.save(); this.setView('subtopic-editor');
    },
    renameSet(setId) {
        const set = this.findSet(activeSubtopicId, setId);
        if (set) this.promptInput("Rename Question Set", "Set Name", `app._updateSetName('${setId}', val)`, set.name);
    },
    _updateSetName(setId, name) {
        const set = this.findSet(activeSubtopicId, setId);
        if (!set || !name.trim()) return;
        set.name = name.trim();
        this.save();
        this.setView('subtopic-editor');
        this.showToast("Question set renamed.", "success");
    },
    editSet(setId) {
        activeSetId = setId;
        document.getElementById('header-title').textContent = "Set Editor";
        this.setView('set-editor');
    },
    deleteItem(type, idx) {
        if(!confirm("Are you sure you want to delete this?")) return;
        const stData = this.findSubtopic(activeSubtopicId);
        
        if (type === 'fc') stData.subtopic.flashcards.splice(idx, 1);
        else if (type === 'set') stData.subtopic.questionSets.splice(idx, 1);
        else if (type === 'q') {
            const set = this.findSet(activeSubtopicId, activeSetId);
            set.questions.splice(idx, 1);
            this.save(); this.setView('set-editor'); return;
        }
        this.save(); this.setView('subtopic-editor');
    },

    renderSetEditor(container) {
        const set = this.findSet(activeSubtopicId, activeSetId);
        if(!set) return;

        let html = `
            <div class="max-w-4xl mx-auto">
                <div class="mb-8 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-2xl gap-4">
                    <div>
                        <h1 class="text-4xl font-black text-white tracking-tight">${this.escapeHTML(set.name)}</h1>
                        <p class="text-slate-500 font-bold mt-2 uppercase tracking-widest text-xs">Manage Questions</p>
                    </div>
                    <button onclick="app.showQuestionForm()" class="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_4px_0_0_#065f46] active:translate-y-1 rounded-2xl font-black tracking-widest uppercase text-sm transition-all flex items-center gap-2">
                        <i class="ph-bold ph-plus text-xl"></i> Add Question
                    </button>
                </div>
                <div class="space-y-6">
        `;
        
        if(set.questions.length === 0) html += `<div class="text-center py-16 text-slate-600 text-sm font-black tracking-widest uppercase bg-slate-900 rounded-[2rem] border-2 border-slate-800 border-dashed">No questions in this set yet.</div>`;
        
        set.questions.forEach((q, idx) => {
            let typeBadge = q.type === 'mcq' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : (q.type==='msq' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20');
            html += `
                <div class="p-6 sm:p-8 rounded-[2rem] border border-slate-800 bg-slate-900 relative shadow-xl group hover:border-slate-600 transition-colors">
                    <div class="absolute top-5 right-5 flex gap-2">
                        <button onclick="app.editQuestion(${idx})" title="Edit question" class="text-slate-400 hover:text-blue-400 p-2.5 bg-slate-950 rounded-xl hover:bg-slate-800 transition-colors border border-slate-800"><i class="ph-bold ph-pencil-simple text-lg"></i></button>
                        <button onclick="app.deleteItem('q', ${idx})" title="Delete question" class="text-slate-600 hover:text-red-400 p-2.5 bg-slate-950 rounded-xl hover:bg-slate-800 transition-colors border border-slate-800"><i class="ph-bold ph-trash text-xl"></i></button>
                    </div>
                    
                    <div class="flex items-center gap-2 mb-6 border-b border-slate-800 pb-5">
                        <span class="text-[10px] uppercase font-black px-3 py-1.5 rounded-lg ${typeBadge} tracking-widest">${q.type}</span>
                    </div>
                    
                    ${this.safeImageURL(q.img) ? `<img src="${this.safeImageURL(q.img)}" alt="Question illustration" loading="lazy" class="max-h-64 object-contain mb-6 rounded-2xl border border-slate-700 bg-slate-950 p-2 w-full shadow-inner">` : ''}
                    ${q.text ? `<p class="font-black text-white mb-6 text-xl sm:text-2xl leading-snug tracking-tight">${this.escapeHTML(q.text)}</p>` : ''}
                    
                    <div class="text-sm font-bold text-slate-300 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                        ${q.type === 'num' ? `<span class="font-black text-slate-600 uppercase mr-3 tracking-widest text-[10px]">Answer:</span> <span class="text-emerald-400 text-xl font-black">${this.escapeHTML(q.correct)}</span>` : `<span class="font-black text-slate-600 uppercase mr-3 tracking-widest text-[10px] block mb-3">Options:</span> <ul class="list-disc pl-5 space-y-2">${q.options.map((o, i) => {
                            let isC = q.type==='mcq' ? i===q.correct : q.correct.includes(i);
                            return `<li class="${isC ? 'text-emerald-400 font-black' : 'text-slate-400'}">${this.escapeHTML(o)}</li>`;
                        }).join('')}</ul>`}
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
        container.innerHTML = html;
    },

    // Modals for Flashcards & Questions
});
