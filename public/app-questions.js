/* Question authoring and question-set editing workflows */
Object.assign(window.app, {
    showQuestionForm(question = null) {
        editingQuestionId = question ? question.id : null;
        app.tempImageUrl = question?.img || '';
        const html = `
            <div class="space-y-6">
                <div>
                    <label class="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Question Type</label>
                    <select id="q-type" onchange="app.renderQuestionFields()" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white outline-none font-bold shadow-inner appearance-none cursor-pointer tracking-wide">
                        <option value="mcq" ${question?.type === 'mcq' ? 'selected' : ''}>Multiple Choice (MCQ)</option>
                        <option value="msq" ${question?.type === 'msq' ? 'selected' : ''}>Multiple Select (MSQ)</option>
                        <option value="num" ${question?.type === 'num' ? 'selected' : ''}>Numerical</option>
                    </select>
                </div>
                <div>
                    <label class="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Question Text <span class="text-slate-600">- Optional if image attached</span></label>
                    <textarea id="q-text" rows="2" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-lg shadow-inner">${this.escapeHTML(question?.text || '')}</textarea>
                </div>
                
                <div class="bg-slate-950/50 p-5 rounded-2xl border border-slate-800">
                    <label class="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Attach / Ctrl+V</label>
                    <input type="file" accept="image/*" onchange="app.handleImageUpload(event)" class="w-full text-sm text-slate-400 file:mr-4 file:py-3 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-black file:tracking-widest file:uppercase file:bg-blue-600 file:text-white hover:file:bg-blue-500 transition-all cursor-pointer mb-5">
                    
                    <div class="flex items-center gap-4 mb-4"><div class="h-px bg-slate-800 flex-1"></div><span class="text-[10px] text-slate-600 font-black uppercase tracking-widest">OR PASTE URL</span><div class="h-px bg-slate-800 flex-1"></div></div>
                    
                    <input type="text" id="img-url-input" value="${this.escapeHTML(question?.img || '')}" placeholder="https://..." oninput="app.handleImageUrl(this.value)" class="w-full px-5 py-3.5 rounded-xl border border-slate-700 bg-slate-900 text-white focus:border-blue-500 outline-none font-mono text-sm shadow-inner">
                    <div id="img-preview">${this.safeImageURL(question?.img) ? `<img src="${this.safeImageURL(question.img)}" alt="Question illustration" class="max-h-40 object-contain rounded-xl shadow-lg border border-slate-700 mt-4 bg-slate-950 p-2">` : ''}</div>
                </div>

                <div id="q-dynamic-fields" class="p-5 bg-slate-900 rounded-2xl border border-slate-800 shadow-inner"></div>
                <button onclick="app.saveQuestion()" class="w-full py-4 bg-emerald-600 text-white font-black tracking-widest uppercase text-sm rounded-xl hover:bg-emerald-500 transition shadow-[0_4px_0_0_#065f46] active:translate-y-1 mt-6 border border-emerald-500">${question ? 'Update Question' : 'Save Question'}</button>
            </div>
        `;
        this.showModal(question ? "Edit Question" : "New Question", html);
        this.renderQuestionFields();
        if (question) {
            if (question.type === 'num') {
                const answer = document.getElementById('q-num-ans');
                if (answer) answer.value = question.correct ?? '';
            } else {
                const correctIndexes = Array.isArray(question.correct) ? question.correct : [question.correct];
                (question.options || []).forEach((option, i) => {
                    const optionInput = document.getElementById(`q-opt-${i}`);
                    const correctInput = document.getElementById(`q-correct-opt-${i}`);
                    if (optionInput) optionInput.value = option;
                    if (correctInput) correctInput.checked = correctIndexes.includes(i);
                });
            }
        }
    },
    editQuestion(index) {
        const set = this.findSet(activeSubtopicId, activeSetId);
        const question = set?.questions[index];
        if (question) this.showQuestionForm(question);
    },
    renderQuestionFields() {
        const type = document.getElementById('q-type').value;
        const container = document.getElementById('q-dynamic-fields');
        if (type === 'num') {
            container.innerHTML = `<label class="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Exact Answer</label><input type="number" step="any" id="q-num-ans" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white outline-none font-mono font-bold text-xl shadow-inner">`;
        } else {
            let html = `<label class="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Options (Select Correct)</label><div class="space-y-3">`;
            const inputType = type === 'mcq' ? 'radio' : 'checkbox';
            for(let i=0; i<4; i++) {
                html += `
                    <div class="flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-700 shadow-inner group focus-within:border-emerald-500 transition-colors">
                        <input type="${inputType}" name="q-correct-opt" id="q-correct-opt-${i}" value="${i}" class="w-6 h-6 cursor-pointer accent-emerald-500 ml-2">
                        <input type="text" id="q-opt-${i}" placeholder="Option ${i+1}" class="flex-1 outline-none text-base font-bold bg-transparent text-white placeholder-slate-600 py-1">
                    </div>
                `;
            }
            html += `</div>`;
            container.innerHTML = html;
        }
    },
    saveQuestion() {
        const type = document.getElementById('q-type').value;
        const text = document.getElementById('q-text').value.trim();
        if (app.imageUploadInProgress) return this.showToast("Please wait for the image upload to finish.", "error");
        const previewImage = document.querySelector('#img-preview img');
        const imageUrl = this.safeImageURL(app.tempImageUrl || previewImage?.getAttribute('src') || '');
        if (!text && !imageUrl) return alert("Attach an image or enter question text.");

        let qObj = { id: editingQuestionId || generateId(), type, text, img: imageUrl };
        
        if (type === 'num') {
            const ans = document.getElementById('q-num-ans').value;
            if(ans === '') return alert("Provide numerical answer.");
            qObj.correct = parseFloat(ans);
        } else {
            let options = [], correct = [];
            for(let i=0; i<4; i++) {
                const optText = document.getElementById(`q-opt-${i}`).value.trim();
                const isChecked = document.getElementById(`q-correct-opt-${i}`).checked;
                
                if(optText) {
                    options.push(optText);
                    if(isChecked) correct.push(options.length - 1); 
                } else if (isChecked) {
                    return alert(`You selected Option ${i+1} as correct, but left its text empty. Please type the option text.`);
                }
            }
            if(options.length < 2) return alert("Please type text into at least 2 option boxes.");
            if(correct.length === 0) return alert("Select at least one correct answer.");
            
            qObj.options = options;
            qObj.correct = type === 'mcq' ? correct[0] : correct; 
        }

        const set = this.findSet(activeSubtopicId, activeSetId);
        if (!set) return this.showToast("Question set not found.", "error");
        if (editingQuestionId) {
            const index = set.questions.findIndex(x => x.id === editingQuestionId);
            if (index !== -1) set.questions[index] = qObj;
        } else {
            set.questions.push(qObj);
        }
        editingQuestionId = null;
        app.tempImageUrl = '';
        this.save(); this.closeModal(); this.setView('set-editor');
        this.showToast("Question saved.", "success");
    },

});
