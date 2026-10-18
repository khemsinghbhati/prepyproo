/* Flashcard study sessions, quiz flow, scoring, and timing */
Object.assign(window.app, {
    startStudy(type, setId = null) {
        document.getElementById('action-sheet').classList.add('hidden');
        const stData = this.findSubtopic(activeSubtopicId);
        if (!stData) return this.showToast("Subtopic not found. Please return to the Learning Path.", "error");
        
        if(type === 'flashcards' && stData.subtopic.flashcards.length === 0) return this.showToast("No flashcards.", "error");
        if(type === 'quiz') {
            const set = stData.subtopic.questionSets.find(x => x.id === setId);
            if(!set || set.questions.length === 0) return this.showToast("No questions in this set.", "error");
            activeSetId = setId;
        }
        
        studyContext = {
            type,
            step: 0,
            score: 0,
            answers: {},
            isFlipped: false,
            isChecked: false,
            timeSpent: [],
            timeRecorded: {},
            qStart: Date.now()
        };
        this.setView(type === 'flashcards' ? 'fc-viewer' : 'quiz-player');
    },

    renderFlashcardViewer(container) {
        const stData = this.findSubtopic(activeSubtopicId);
        if (!stData) { this.setView('dashboard'); return; }
        const cards = stData.subtopic.flashcards;
        if(studyContext.step >= cards.length) { this.finishSession(); return; }
        const card = cards[studyContext.step];
        const progress = (studyContext.step / cards.length) * 100;

        container.innerHTML = `
            <div class="max-w-5xl mx-auto h-full flex flex-col pt-4">
                <div class="w-full h-3 bg-slate-900 rounded-full mb-10 overflow-hidden border border-slate-800 shadow-inner"><div class="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]" style="width:${progress}%"></div></div>
                <div class="flex-1 relative perspective-1000 cursor-pointer w-full min-h-[500px]" onclick="app.toggleFlip()">
                    <div class="w-full h-full duration-500 transform-style-3d relative rounded-[3rem] shadow-2xl ${studyContext.isFlipped ? 'rotate-y-180' : ''}">
                        
                        <!-- Front -->
                        <div class="absolute inset-0 backface-hidden bg-slate-900 border-2 border-slate-800 rounded-[3rem] p-8 sm:p-14 flex flex-col items-center justify-center text-center shadow-2xl">
                            <span class="absolute top-10 left-1/2 transform -translate-x-1/2 text-[10px] font-black text-blue-400 bg-blue-500/10 px-5 py-2.5 rounded-xl uppercase tracking-widest border border-blue-500/20">Tap to flip</span>
                            <h3 class="text-4xl sm:text-6xl font-black text-white leading-tight tracking-tight">${this.escapeHTML(card.front)}</h3>
                        </div>

                        <!-- Back -->
                        <div class="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-500/30 rounded-[3rem] p-5 sm:p-8 flex flex-col items-center justify-start text-center overflow-y-auto overflow-x-hidden shadow-[0_0_50px_rgba(59,130,246,0.15)]">
                            ${this.safeImageURL(card.img) ? `<div class="w-full flex flex-col items-center mb-6" onclick="event.stopPropagation()"><img src="${this.safeImageURL(card.img)}" alt="Flashcard attachment" loading="lazy" class="block w-auto h-auto max-w-full object-contain rounded-2xl shadow-xl border border-slate-700 bg-slate-950 p-2 sm:p-3"></div>` : ''}
                            ${card.back ? `<div class="shrink-0 overflow-y-auto max-h-1/2 w-full"><p class="text-2xl sm:text-4xl font-extrabold text-blue-100 whitespace-pre-line leading-relaxed">${this.escapeHTML(card.back)}</p></div>` : ''}
                        </div>
                    </div>
                </div>
                <div class="mt-12 mb-6">
                    <button onclick="event.stopPropagation(); app.nextCard()" class="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-3xl shadow-[0_8px_0_0_#1e3a8a] active:translate-y-2 text-2xl tracking-widest uppercase transition-all">Got It!</button>
                </div>
            </div>
        `;
    },
    toggleFlip() { studyContext.isFlipped = !studyContext.isFlipped; this.renderFlashcardViewer(document.getElementById('view-container')); },
    nextCard() { studyContext.step++; studyContext.isFlipped = false; this.renderFlashcardViewer(document.getElementById('view-container')); },

    renderQuizPlayer(container) {
        const set = this.findSet(activeSubtopicId, activeSetId);
        if (!set) { this.setView('dashboard'); return; }
        const questions = set.questions;
        if(studyContext.step >= questions.length) { this.finishSession(); return; }
        const q = questions[studyContext.step];
        const progress = (studyContext.step / questions.length) * 100;
        const isChecked = studyContext.isChecked;

        let optionsHtml = '';
        if (q.type === 'num') {
            let style = isChecked ? (studyContext.answers[studyContext.step] == q.correct ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-red-500 bg-red-500/10 text-red-400") : "border-slate-700 bg-slate-950 text-white focus:border-blue-500 shadow-inner";
            let reveal = isChecked ? `<div class="mt-4 p-3 bg-slate-900 border border-slate-800 rounded-xl font-bold text-slate-400 text-sm tracking-wide uppercase shadow-inner text-center">Correct Answer: <span class="text-emerald-400 ml-2 text-base sm:text-lg">${this.escapeHTML(q.correct)}</span></div>` : "";
            optionsHtml = `<div class="mt-4"><input type="number" step="any" ${isChecked?'disabled':''} value="${this.escapeHTML(studyContext.answers[studyContext.step] || '')}" oninput="app.selectQuizAnswer(this.value)" class="w-full text-center text-xl sm:text-2xl font-black py-3 sm:py-4 rounded-2xl border-2 ${style} outline-none shadow-xl transition-all shadow-inner">${reveal}</div>`;
        } else {
            optionsHtml = `<div class="mt-4 space-y-2">`;
            const cur = studyContext.answers[studyContext.step] || (q.type === 'msq' ? [] : null);
            q.options.forEach((opt, idx) => {
                let btnStyle = "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300", icon = "";
                if (isChecked) {
                    const isCorrectOpt = q.type === 'mcq' ? q.correct === idx : q.correct.includes(idx);
                    const isSel = q.type === 'mcq' ? cur === idx : cur.includes(idx);
                    if (isCorrectOpt) { btnStyle = "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.15)]"; icon = `<i class="ph-bold ph-check-circle text-emerald-400 text-2xl"></i>`; } 
                    else if (isSel) { btnStyle = "border-red-500 bg-red-500/20 text-red-300 shadow-[0_0_18px_rgba(239,68,68,0.15)]"; icon = `<i class="ph-bold ph-x-circle text-red-500 text-2xl"></i>`; } 
                    else btnStyle = "border-slate-800 bg-slate-950/50 opacity-30";
                } else {
                    if ((q.type === 'mcq' && cur === idx) || (q.type === 'msq' && cur.includes(idx))) btnStyle = "border-blue-500 bg-blue-600/20 text-blue-200 border-2 shadow-[0_0_20px_rgba(59,130,246,0.25)] scale-[1.02]";
                }
                optionsHtml += `<button type="button" ${isChecked?'':`onclick="app.selectQuizAnswer(${idx})"`} class="w-full text-left p-3 sm:p-4 rounded-xl border-2 ${btnStyle} font-bold text-sm sm:text-base leading-snug flex items-center justify-between gap-3 transition-all"><span class="min-w-0 flex-1 break-words">${this.escapeHTML(opt)}</span>${icon}</button>`;
            });
            optionsHtml += `</div>`;
            if(q.type==='msq') optionsHtml += `<p class="mt-3 text-center text-[10px] sm:text-xs font-black text-purple-400 bg-purple-500/10 py-2 rounded-xl border border-purple-500/20 uppercase tracking-widest shadow-sm">Select all that apply</p>`;
        }

        let footerHtml = "";
        if (isChecked) {
            const isCorrect = this.evalQuizAnswer(q, studyContext.answers[studyContext.step]);
            const feedback = isCorrect ? `<div class="text-emerald-400 font-black text-base sm:text-lg uppercase tracking-wider flex items-center gap-2"><i class="ph-fill ph-check-circle text-xl"></i> Awesome!</div>` : `<div class="text-red-400 font-black text-base sm:text-lg uppercase tracking-wider flex items-center gap-2"><i class="ph-fill ph-warning-circle text-xl"></i> Review This.</div>`;
            footerHtml = `<div class="mt-5 pt-4 pb-3 border-t border-slate-800"><div class="flex flex-col sm:flex-row gap-3 items-center justify-between">${feedback}<button type="button" onclick="app.nextQuizQuestion()" class="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-[0_4px_0_0_#065f46] active:translate-y-1 text-base sm:text-lg tracking-widest uppercase transition-all">Continue</button></div></div>`;
        } else {
            const hasAns = (q.type!=='msq'&&q.type!=='num'&&studyContext.answers[studyContext.step]!=null) || (q.type==='msq'&&studyContext.answers[studyContext.step]?.length>0) || (q.type==='num'&&studyContext.answers[studyContext.step]);
            footerHtml = `<div class="mt-5 pt-4 pb-3 border-t border-slate-800"><div class="flex justify-end"><button type="button" ${hasAns?'':'disabled'} onclick="app.checkQuizAnswer()" class="w-full sm:w-auto px-10 sm:px-12 py-3.5 ${hasAns?'bg-blue-600 text-white shadow-[0_4px_0_0_#1e3a8a] hover:bg-blue-500 border border-blue-400':'bg-slate-900 text-slate-700 shadow-[0_4px_0_0_#0f172a] cursor-not-allowed border border-slate-800'} font-black rounded-xl active:translate-y-1 transition-all text-base sm:text-lg uppercase tracking-widest">Check</button></div></div>`;
        }

        container.innerHTML = `
            <div class="quiz-question-scroll max-w-5xl mx-auto flex flex-col pt-2 pb-4 animate-pop">
                <div class="w-full flex items-center justify-between mb-4 bg-slate-900 p-2 sm:p-3 rounded-xl border border-slate-800 shadow-lg shrink-0">
                    <div class="flex-1 h-3 bg-slate-950 rounded-full mr-4 overflow-hidden border border-slate-800 shadow-inner"><div class="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]" style="width:${progress}%"></div></div>
                    <span class="text-xs font-black text-slate-500 uppercase tracking-widest bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 shadow-inner whitespace-nowrap">Q ${studyContext.step+1} / ${questions.length}</span>
                </div>
                ${q.text ? `<h2 class="shrink-0 text-xl sm:text-2xl font-extrabold text-white leading-snug tracking-tight">${this.escapeHTML(q.text)}</h2>` : ''}
                ${this.safeImageURL(q.img) ? `<img src="${this.safeImageURL(q.img)}" alt="Question illustration" loading="lazy" class="block w-auto h-auto max-w-full object-contain mx-auto my-5 rounded-xl shadow-xl border border-slate-700 bg-slate-950 p-2 sm:p-3">` : ''}
                ${optionsHtml}
                ${footerHtml}
                <div class="h-2 shrink-0"></div>
            </div>
        `;
    },
    selectQuizAnswer(val) {
        const q = this.findSet(activeSubtopicId, activeSetId).questions[studyContext.step];
        if (q.type === 'num') {
            studyContext.answers[studyContext.step] = val;
            const checkButton = document.querySelector('#view-container button[onclick="app.checkQuizAnswer()"]');
            if (checkButton) {
                const hasAnswer = String(val ?? '').trim() !== '';
                checkButton.disabled = !hasAnswer;
                checkButton.className = `w-full sm:w-auto px-10 sm:px-12 py-3.5 font-black rounded-xl active:translate-y-1 transition-all text-base sm:text-lg uppercase tracking-widest ${hasAnswer
                    ? 'bg-blue-600 text-white shadow-[0_4px_0_0_#1e3a8a] hover:bg-blue-500 border border-blue-400'
                    : 'bg-slate-900 text-slate-700 shadow-[0_4px_0_0_#0f172a] cursor-not-allowed border border-slate-800'}`;
            }
            return;
        }

        if (q.type === 'mcq') studyContext.answers[studyContext.step] = val;
        else {
            let arr = studyContext.answers[studyContext.step] || [];
            if (arr.includes(val)) arr = arr.filter(x => x !== val); else arr.push(val);
            studyContext.answers[studyContext.step] = arr;
        }

        const container = document.getElementById('view-container');
        const scrollTop = container?.scrollTop || 0;
        document.activeElement?.blur();
        this.renderQuizPlayer(container);
        requestAnimationFrame(() => {
            if (container) container.scrollTop = scrollTop;
        });
    },
    evalQuizAnswer(q, ans) {
        if(ans == null || ans === '') return false;
        if(q.type === 'mcq') return ans === q.correct;
        if(q.type === 'msq') return ans.length === q.correct.length && ans.every(v => q.correct.includes(v));
        if(q.type === 'num') return parseFloat(ans) === parseFloat(q.correct);
        return false;
    },
    // Record elapsed time at the current question index. This is idempotent:
    // repeated calls cannot double-count a question or shift timings out of alignment.
    recordCurrentQuestionTime() {
        if (studyContext.type !== 'quiz') return 0;

        const questionIndex = Number(studyContext.step);
        if (!Number.isInteger(questionIndex) || questionIndex < 0) return 0;

        if (!studyContext.timeRecorded) studyContext.timeRecorded = {};
        if (studyContext.timeRecorded[questionIndex]) {
            return Number(studyContext.timeSpent[questionIndex]) || 0;
        }

        const startedAt = Number(studyContext.qStart);
        const elapsedMs = Number.isFinite(startedAt) && startedAt > 0
            ? Math.max(0, Date.now() - startedAt)
            : 0;

        // Store by question index, not push(), so every duration matches its question.
        studyContext.timeSpent[questionIndex] = elapsedMs;
        studyContext.timeRecorded[questionIndex] = true;
        return elapsedMs;
    },

    checkQuizAnswer() {
        // Prevent duplicate clicks from adding score or timing the same question twice.
        if (studyContext.isChecked) return;

        this.recordCurrentQuestionTime();
        studyContext.isChecked = true;

        const set = this.findSet(activeSubtopicId, activeSetId);
        const q = set?.questions?.[studyContext.step];
        if (!q) return this.showToast('Question not found.', 'error');
        if (this.evalQuizAnswer(q, studyContext.answers[studyContext.step])) studyContext.score++;
        const container = document.getElementById('view-container');
        const scrollTop = container?.scrollTop || 0;
        this.renderQuizPlayer(container);
        requestAnimationFrame(() => {
            if (container) container.scrollTop = scrollTop;
        });
    },
    nextQuizQuestion() {
        // The Continue button is only available after checking the current answer.
        if (!studyContext.isChecked) return;

        // Safe to call again because recordCurrentQuestionTime() records each index once.
        this.recordCurrentQuestionTime();
        studyContext.isChecked = false;
        studyContext.step++;
        studyContext.qStart = Date.now();
        const container = document.getElementById('view-container');
        this.renderQuizPlayer(container);
        requestAnimationFrame(() => {
            if (container) container.scrollTop = 0;
        });
    },
    
    finishSession() {
        let xpGained = 10; 
        const stData = this.findSubtopic(activeSubtopicId);
        
        if (studyContext.type === 'quiz') {
            const set = stData.subtopic.questionSets.find(x => x.id === activeSetId);
            const totalQ = set.questions.length;
            const accuracy = totalQ ? Math.round((studyContext.score/totalQ)*100) : 0;
            
            if(!set.history) set.history = [];
            set.history.push({
                correct: studyContext.score,
                total: totalQ,
                acc: accuracy,
                date: new Date().toLocaleDateString(),
                timestamp: Date.now(),
                answers: JSON.parse(JSON.stringify(studyContext.answers)),
                // Persist one duration per question, in question order, in milliseconds.
                timeSpent: set.questions.map((_, questionIndex) => {
                    const value = Number(studyContext.timeSpent[questionIndex]);
                    return Number.isFinite(value) && value >= 0 ? value : 0;
                })
            });
            xpGained += studyContext.score * 15;
        } else {
            stData.subtopic.flashcardRevisions = (stData.subtopic.flashcardRevisions || 0) + 1;
        }
        
        data.xp += xpGained;
        this.save();

        const container = document.getElementById('view-container');
        container.innerHTML = `
            <div id="session-completion-screen" class="max-w-2xl mx-auto text-center py-24 animate-pop">
                <div class="relative w-64 h-64 mx-auto mb-14">
                    <div class="absolute inset-0 bg-yellow-500 rounded-full blur-[60px] opacity-20 animate-pulse"></div>
                    <div class="relative bg-gradient-to-tr from-yellow-500 to-amber-600 w-full h-full rounded-full flex items-center justify-center border-[10px] border-slate-950 shadow-[0_0_50px_rgba(245,158,11,0.3)]">
                        <i class="ph-fill ph-trophy text-white text-[120px] drop-shadow-lg"></i>
                    </div>
                </div>
                <h2 class="text-6xl font-black text-white mb-8 tracking-tighter">Great Job!</h2>
                <div class="bg-slate-900 p-10 rounded-[3rem] border border-slate-800 shadow-2xl mb-14 mt-8 flex items-center justify-center gap-8 relative overflow-hidden">
                    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-500/10 via-transparent to-transparent"></div>
                    <i class="ph-fill ph-lightning text-yellow-400 text-[80px] animate-bounce drop-shadow-[0_0_30px_rgba(250,204,21,0.6)] relative z-10"></i>
                    <div class="text-left relative z-10">
                        <p class="text-sm font-black text-slate-500 uppercase tracking-widest mb-1">XP Earned</p>
                        <p class="text-6xl font-black text-yellow-400 drop-shadow-md">+${xpGained}</p>
                    </div>
                </div>
                <button onclick="app.goBack()" class="w-full py-6 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-[2rem] shadow-[0_8px_0_0_#1e3a8a] active:translate-y-2 text-2xl uppercase tracking-widest transition-all">Continue</button>
            </div>
        `;
    },

    // --- Analytics & Detailed Historical Review ---
});
