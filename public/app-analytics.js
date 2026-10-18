/* Learning analytics, charts, history, and attempt review */
Object.assign(window.app, {
    getSubjectStats(subjectId) {
        const subj = data.subjects.find(s => s.id === subjectId);
        if (!subj) return null;

        let sTotalQs = 0; let sRevs = 0;
        const topStats = [];

        subj.topics.forEach(topic => {
            let tTotalQs = 0; let tRevs = 0;
            const subStats = [];

            topic.subtopics.forEach(subtopic => {
                let stTotalQs = 0; 
                let stRevs = subtopic.flashcardRevisions || 0;
                const setStats = [];

                subtopic.questionSets.forEach(set => {
                    let setTotal = 0;
                    if(set.history) {
                        set.history.forEach(h => { setTotal += h.total; });
                        stRevs += set.history.length;
                    }
                    stTotalQs += setTotal; 

                    setStats.push({ 
                        id: set.id,
                        name: set.name,
                        history: set.history || []
                    });
                });

                tTotalQs += stTotalQs; tRevs += stRevs;
                subStats.push({ 
                    id: subtopic.id,
                    name: subtopic.name, 
                    fcRevs: subtopic.flashcardRevisions || 0,
                    total: stTotalQs, 
                    setStats 
                });
            });

            sTotalQs += tTotalQs; sRevs += tRevs;
            topStats.push({ id: topic.id, name: topic.name, rev: tRevs, total: tTotalQs, subStats });
        });

        return {
            name: subj.name, color: subj.color,
            rev: sRevs, total: sTotalQs,
            topStats
        };
    },
    
    setAnalyticsSubject(id) {
        activeAnalyticsSubjectId = id;
        this.renderAnalytics(document.getElementById('view-container'));
    },

    toggleAnalyticsSubjectExpanded(subjectId) {
        if (collapsedAnalyticsSubjectIds.has(subjectId)) collapsedAnalyticsSubjectIds.delete(subjectId);
        else collapsedAnalyticsSubjectIds.add(subjectId);
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        this.renderAnalytics(document.getElementById('view-container'));
        window.scrollTo(0, scrollY);
    },

    toggleAnalyticsTopicExpanded(topicId) {
        if (collapsedAnalyticsTopicIds.has(topicId)) collapsedAnalyticsTopicIds.delete(topicId);
        else collapsedAnalyticsTopicIds.add(topicId);
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        this.renderAnalytics(document.getElementById('view-container'));
        window.scrollTo(0, scrollY);
    },

    toggleAnalyticsSubtopicExpanded(subtopicId) {
        if (collapsedAnalyticsSubtopicIds.has(subtopicId)) collapsedAnalyticsSubtopicIds.delete(subtopicId);
        else collapsedAnalyticsSubtopicIds.add(subtopicId);
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        this.renderAnalytics(document.getElementById('view-container'));
        window.scrollTo(0, scrollY);
    },

    updateChartInfo(text) {
        const panel = document.getElementById('chart-hover-info');
        if (panel) panel.textContent = text;
    },

    _buildChartHtml(title, subtitle, historyItems) {
        if (historyItems.length === 0) {
            this.showModal(`Performance Graph`, `<div class="text-center py-16 text-slate-500 font-bold border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/50 text-lg uppercase tracking-widest">No attempts recorded yet.</div>`);
            return;
        }

        let bars = historyItems.map((h, i) => {
            let color = h.acc < 60 ? 'bg-red-500' : (h.acc < 80 ? 'bg-yellow-500' : 'bg-emerald-500');
            let targetSetId = h.setId || historyItems.setId; 
            let origIdx = h.origIndex !== undefined ? h.origIndex : i;

            return `
                <div
                    data-chart-index="${i}"
                    data-set-id="${this.escapeHTML(targetSetId)}"
                    data-attempt-index="${origIdx}"
                    role="button"
                    tabindex="0"
                    class="flex flex-col items-center justify-end h-full group relative min-w-[48px] flex-1 max-w-[80px] cursor-pointer hover:-translate-y-2 transition-transform"
                >
                    <div class="w-full ${color} rounded-t-xl transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] relative overflow-hidden group-hover:brightness-125" style="height: ${Math.max(h.acc, 2)}%;">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                        <div class="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    </div>
                    <span class="text-[10px] font-black text-slate-600 mt-4 truncate w-full text-center group-hover:text-white transition-colors">#${i+1}</span>
                </div>
            `;
        }).join('');

        let html = `
            <div class="px-2 pt-6 pb-6">
                <div class="mb-10 text-center">
                    <h4 class="text-4xl font-black text-white tracking-tight">${this.escapeHTML(title)}</h4>
                    <p class="text-xs font-bold text-slate-500 mt-3 uppercase tracking-widest">${this.escapeHTML(subtitle)}</p>
                </div>

                <!-- Static Info Panel -->
                <div id="chart-hover-info" class="mb-10 p-5 bg-slate-950 border border-slate-800 rounded-2xl text-center text-sm text-slate-400 font-bold shadow-inner flex items-center justify-center min-h-[72px] transition-all tracking-wide">
                    Hover over a bar to view summary, or <span class="text-blue-400 font-black ml-1">CLICK TO REVIEW</span>.
                </div>
                
                <div class="relative w-full h-[360px] flex bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-2xl">
                    <div class="flex flex-col justify-between text-[10px] font-black text-slate-600 pr-6 pb-10 border-r-2 border-slate-800 text-right w-16 shrink-0 tracking-widest">
                        <span>100%</span>
                        <span>75%</span>
                        <span>50%</span>
                        <span>25%</span>
                        <span>0%</span>
                    </div>
                    
                    <div class="flex-1 overflow-x-auto hide-scrollbar pb-2 pl-6 relative">
                        <!-- Background Grid Lines -->
                        <div class="absolute inset-0 pl-6 flex flex-col justify-between pb-10 pointer-events-none z-0">
                            <div class="w-full border-b border-slate-800 border-dashed h-0"></div>
                            <div class="w-full border-b border-slate-800 border-dashed h-0"></div>
                            <div class="w-full border-b border-slate-800 border-dashed h-0"></div>
                            <div class="w-full border-b border-slate-800 border-dashed h-0"></div>
                            <div class="w-full border-b-2 border-slate-700 h-0"></div>
                        </div>
                        
                        <!-- Chart Bars -->
                        <div class="flex items-end h-full pb-10 px-4 gap-4 z-10 relative min-w-max">
                            ${bars}
                        </div>
                    </div>
                </div>
                <div class="text-center mt-8 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    <i class="ph-bold ph-arrows-left-right text-sm align-middle mr-1"></i> Scroll horizontally if needed
                </div>
            </div>
        `;
        this.showModal(`Performance Graph`, html);

        // Bind chart interactions after rendering instead of embedding JavaScript
        // and nested HTML quotes inside inline event-handler attributes.
        const infoPanel = document.getElementById('chart-hover-info');
        const chartBars = document.querySelectorAll('#modal-content [data-chart-index]');

        const showDefaultInfo = () => {
            if (!infoPanel) return;
            infoPanel.replaceChildren();
            infoPanel.append('Hover over a bar to view summary, or ');
            const hint = document.createElement('span');
            hint.className = 'text-blue-400 font-black ml-1';
            hint.textContent = 'CLICK TO REVIEW';
            infoPanel.append(hint, '.');
        };

        chartBars.forEach(bar => {
            const index = Number(bar.dataset.chartIndex);
            const item = historyItems[index];

            bar.addEventListener('mouseenter', () => {
                if (!infoPanel || !item) return;
                infoPanel.replaceChildren();
                infoPanel.append(`Attempt ${index + 1}: `);

                const accuracy = document.createElement('span');
                accuracy.className = 'text-white font-black text-xl mx-2';
                accuracy.textContent = `${item.acc}%`;

                const result = document.createElement('span');
                result.className = 'text-slate-400';
                result.textContent = `(${item.correct}/${item.total})`;

                const date = document.createElement('span');
                date.className = 'text-slate-600 ml-3 uppercase text-[10px] tracking-widest';
                date.textContent = `on ${item.date}`;

                infoPanel.append(accuracy, ' ', result, ' ', date);
            });

            bar.addEventListener('mouseleave', showDefaultInfo);
            bar.addEventListener('click', () => {
                this.showAttemptReview(bar.dataset.setId, Number(bar.dataset.attemptIndex));
            });
            bar.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    this.showAttemptReview(bar.dataset.setId, Number(bar.dataset.attemptIndex));
                }
            });
        });
    },

    showHistoryChart(setId, setName = null) {
        const set = this.findSetByIdAnywhere(setId);
        if (!set) return;
        let items = set.history || [];
        items.setId = setId;
        this._buildChartHtml(setName ?? set.name, "Accuracy over time", items);
    },

    showTopicHistoryChart(topicId, topicName = null) {
        const topic = this.findTopicById(topicId);
        if (!topic) return;
        topicName = topicName ?? topic.name;

        let allAttempts = [];
        topic.subtopics.forEach(st => {
            st.questionSets.forEach(set => {
                if(set.history) {
                    set.history.forEach((h, idx) => {
                        allAttempts.push({
                            ...h,
                            setName: set.name,
                            setId: set.id,        
                            origIndex: idx        
                        });
                    });
                }
            });
        });

        allAttempts.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        this._buildChartHtml(topicName, "Overall Topic Timeline", allAttempts);
    },

    formatTime(ms) {
        if (!ms) return "0s";
        const seconds = Math.floor(ms / 1000);
        if (seconds < 60) return `${seconds}s`;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    },

    // --- Detailed Attempt Review Engine ---
    showAttemptReview(setId, attemptIndex) {
        const set = this.findSetByIdAnywhere(setId);
        if(!set || !set.history || !set.history[attemptIndex]) return;
        const attempt = set.history[attemptIndex];
        
        const recordedTimes = Array.isArray(attempt.timeSpent) ? attempt.timeSpent : [];
        const totalTimeMs = recordedTimes.reduce((sum, value) => {
            const ms = Number(value);
            return sum + (Number.isFinite(ms) && ms > 0 ? ms : 0);
        }, 0);

        let html = `
            <div class="px-2 py-6">
                <div class="mb-10 flex justify-between items-end border-b-2 border-slate-800 pb-8">
                    <div>
                        <h2 class="text-4xl font-black text-white mb-3 tracking-tight">Attempt Review</h2>
                        <p class="text-xs font-black text-slate-500 uppercase tracking-widest">${this.escapeHTML(set.name)} <span class="mx-2">&bull;</span> <span class="text-slate-400">${this.escapeHTML(attempt.date)}</span></p>
                    </div>
                    <div class="text-right">
                        <div class="text-5xl font-black ${attempt.acc >= 80 ? 'text-emerald-400' : (attempt.acc >= 60 ? 'text-yellow-400' : 'text-red-400')} drop-shadow-md tracking-tighter">${attempt.acc}%</div>
                        <div class="text-[10px] font-black text-slate-600 uppercase mt-2 tracking-widest">Final Score</div>
                    </div>
                </div>
                
                <div class="flex gap-6 mb-12 bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl">
                    <div class="flex-1">
                        <div class="text-[10px] text-slate-500 font-black mb-2 uppercase tracking-widest">Correct Answers</div>
                        <div class="text-3xl font-black text-white">${attempt.correct} <span class="text-slate-600 text-xl">/ ${attempt.total}</span></div>
                    </div>
                    <div class="w-0.5 bg-slate-800"></div>
                    <div class="flex-1">
                        <div class="text-[10px] text-slate-500 font-black mb-2 uppercase tracking-widest">Total Time Taken</div>
                        <div class="text-3xl font-black text-blue-400 flex items-center gap-3"><i class="ph-bold ph-clock"></i> ${this.formatTime(totalTimeMs)}</div>
                    </div>
                </div>

                <div class="space-y-10">
        `;

        set.questions.forEach((q, idx) => {
            const userAns = attempt.answers ? attempt.answers[idx] : null;
            const recordedTime = Array.isArray(attempt.timeSpent) ? attempt.timeSpent[idx] : null;
            const hasRecordedTime = recordedTime !== null && recordedTime !== undefined && Number.isFinite(Number(recordedTime));
            const timeTaken = hasRecordedTime ? Math.max(0, Number(recordedTime)) : null;
            const isCorrect = this.evalQuizAnswer(q, userAns);

            let statusColor = isCorrect ? 'border-emerald-500/50 bg-emerald-900/10 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'border-red-500/50 bg-red-900/10 shadow-[0_0_20px_rgba(239,68,68,0.05)]';
            let iconHtml = isCorrect ? '<i class="ph-fill ph-check-circle text-emerald-400 text-3xl drop-shadow-md"></i>' : '<i class="ph-fill ph-x-circle text-red-400 text-3xl drop-shadow-md"></i>';

            let optionsHtml = '';
            if (q.type === 'num') {
                optionsHtml = `
                    <div class="mt-6 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                        <div class="mb-3"><span class="text-slate-600 font-black uppercase tracking-widest text-[10px] mr-4">Your Answer:</span> <span class="font-mono text-white text-xl font-bold">${this.escapeHTML(userAns !== null && userAns !== undefined ? userAns : '-')}</span></div>
                        ${!isCorrect ? `<div><span class="text-slate-600 font-black uppercase tracking-widest text-[10px] mr-4">Correct:</span> <span class="font-mono text-emerald-400 font-black text-xl">${this.escapeHTML(q.correct)}</span></div>` : ''}
                    </div>
                `;
            } else {
                optionsHtml = `<div class="mt-6 space-y-4">`;
                q.options.forEach((opt, optIdx) => {
                    const isCorrectOpt = q.type === 'mcq' ? q.correct === optIdx : q.correct.includes(optIdx);
                    const isSel = userAns ? (q.type === 'mcq' ? userAns === optIdx : userAns.includes(optIdx)) : false;
                    
                    let optStyle = "border-slate-800 bg-slate-950 text-slate-500";
                    let optIcon = "";
                    if (isCorrectOpt && isSel) { optStyle = "border-emerald-500/50 bg-emerald-900/20 text-emerald-400 shadow-inner"; optIcon = `<i class="ph-bold ph-check-circle text-emerald-400 text-2xl"></i>`; }
                    else if (isCorrectOpt && !isSel) { optStyle = "border-emerald-500/50 border-dashed bg-transparent text-emerald-500/60"; optIcon = `<i class="ph-bold ph-check text-emerald-500/60 text-xl"></i>`; }
                    else if (!isCorrectOpt && isSel) { optStyle = "border-red-500/50 bg-red-900/20 text-red-400 shadow-inner"; optIcon = `<i class="ph-bold ph-x-circle text-red-400 text-2xl"></i>`; }
                    
                    optionsHtml += `<div class="p-5 rounded-xl border-2 ${optStyle} text-base font-bold flex justify-between items-center transition-colors"><span>${this.escapeHTML(opt)}</span>${optIcon}</div>`;
                });
                optionsHtml += `</div>`;
            }

            html += `
                <div class="p-8 sm:p-10 rounded-[2rem] border-2 ${statusColor} relative">
                    <div class="flex justify-between items-start mb-6 border-b border-slate-800 pb-5">
                        <div class="flex items-center gap-4">
                            ${iconHtml}
                            <span class="text-xs font-black text-slate-400 uppercase tracking-widest">Question ${idx + 1}</span>
                        </div>
                        ${timeTaken !== null ? `<span class="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-300"><i class="ph-bold ph-clock text-sm"></i> Time: ${this.formatTime(timeTaken)}</span>` : `<span class="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"><i class="ph-bold ph-clock text-sm"></i> Time not recorded</span>`}
                    </div>
                    ${this.safeImageURL(q.img) ? `<img src="${this.safeImageURL(q.img)}" alt="Question illustration" loading="lazy" class="max-h-64 object-contain mt-4 mb-8 rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-inner w-full">` : ''}
                    <p class="font-black text-white text-xl sm:text-2xl leading-snug tracking-tight">${this.escapeHTML(q.text)}</p>
                    ${optionsHtml}
                </div>
            `;
        });

        html += `
                </div>
                <div class="mt-12">
                    <button onclick="app.showHistoryChart('${setId}')" class="w-full py-6 bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-700 transition-all shadow-[0_6px_0_0_#0f172a] active:translate-y-1.5 border border-slate-700 uppercase tracking-widest text-xl flex justify-center items-center gap-3"><i class="ph-bold ph-arrow-left text-2xl"></i> Back to Chart</button>
                </div>
            </div>
        `;

        this.showModal("Attempt Details", html);
    },

    initializeAnalyticsExpansionDefaults(subjectId, stats) {
        // Keep the subject and topic headers expanded on first visit so their
        // collapse controls and nested rows are immediately visible.
        if (!initializedAnalyticsSubjectIds.has(subjectId)) {
            collapsedAnalyticsSubjectIds.delete(subjectId);
            initializedAnalyticsSubjectIds.add(subjectId);
        }
        stats.topStats.forEach(topic => {
            if (!initializedAnalyticsTopicIds.has(topic.id)) {
                collapsedAnalyticsTopicIds.delete(topic.id);
                initializedAnalyticsTopicIds.add(topic.id);
            }
            topic.subStats.forEach(subtopic => {
                if (!initializedAnalyticsSubtopicIds.has(subtopic.id)) {
                    // Subtopic details start collapsed, but their toggle remains visible.
                    collapsedAnalyticsSubtopicIds.add(subtopic.id);
                    initializedAnalyticsSubtopicIds.add(subtopic.id);
                }
            });
        });
    },

    renderAnalytics(container) {
        if (data.subjects.length === 0) {
            container.innerHTML = `
                <div class="max-w-5xl mx-auto text-center py-20 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-xl">
                    <p class="text-slate-500 font-bold text-lg uppercase tracking-widest">No subjects available for analytics.</p>
                </div>
            `;
            return;
        }

        if (!activeAnalyticsSubjectId || !data.subjects.find(s => s.id === activeAnalyticsSubjectId)) {
            activeAnalyticsSubjectId = data.subjects[0].id;
        }

        const stats = this.getSubjectStats(activeAnalyticsSubjectId);
        this.initializeAnalyticsExpansionDefaults(activeAnalyticsSubjectId, stats);

        let tabsHtml = `<div class="flex gap-4 overflow-x-auto pb-4 mb-10 hide-scrollbar">`;
        data.subjects.forEach(s => {
            const isActive = s.id === activeAnalyticsSubjectId;
            tabsHtml += `<button onclick="app.setAnalyticsSubject('${s.id}')" class="px-8 py-4 rounded-2xl font-black whitespace-nowrap transition-all uppercase tracking-widest text-sm ${this.escapeHTML(isActive ? (s.color||'bg-blue-600') + ' text-white shadow-lg border border-transparent scale-[1.02]' : 'bg-slate-900 text-slate-500 hover:bg-slate-800 border border-slate-800 hover:text-white')}">${this.escapeHTML(s.name)}</button>`;
        });
        tabsHtml += `</div>`;
        const isAnalyticsSubjectCollapsed = collapsedAnalyticsSubjectIds.has(activeAnalyticsSubjectId);

        let html = `
            <div class="max-w-5xl mx-auto space-y-10 animate-pop">
                <div class="mb-6">
                    <h2 class="text-sm font-black text-slate-600 uppercase tracking-widest mb-2">Subject Analytics</h2>
                    <h1 class="text-5xl font-black text-white tracking-tight">Performance Tracker</h1>
                </div>

                ${tabsHtml}

                <div class="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
                    <button type="button" onclick="app.toggleAnalyticsSubjectExpanded('${activeAnalyticsSubjectId}')" aria-expanded="${!isAnalyticsSubjectCollapsed}" class="w-full p-6 sm:px-8 flex items-center justify-between gap-4 text-left hover:bg-slate-800/60 transition-colors">
                        <div class="min-w-0">
                            <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Selected Subject</p>
                            <h3 class="text-xl sm:text-2xl font-black text-white truncate">${this.escapeHTML(stats.name)} Analytics</h3>
                        </div>
                        <span class="shrink-0 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
                            ${isAnalyticsSubjectCollapsed ? 'Expand' : 'Collapse'}
                            <i class="ph-bold ${isAnalyticsSubjectCollapsed ? 'ph-caret-down' : 'ph-caret-up'} text-lg"></i>
                        </span>
                    </button>
                </div>
                <div class="${isAnalyticsSubjectCollapsed ? 'hidden' : ''} space-y-10">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-blue-500/50 transition-colors">
                        <div class="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div class="w-20 h-20 bg-blue-500/10 rounded-[1.5rem] flex items-center justify-center text-blue-400 mb-6 border border-blue-500/20 shadow-inner"><i class="ph-bold ph-arrows-clockwise text-4xl"></i></div>
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Subject Revisions</p>
                        <p class="text-5xl font-black text-white tracking-tighter">${stats.rev}</p>
                    </div>
                    <div class="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-purple-500/50 transition-colors">
                        <div class="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div class="w-20 h-20 bg-purple-500/10 rounded-[1.5rem] flex items-center justify-center text-purple-400 mb-6 border border-purple-500/20 shadow-inner"><i class="ph-bold ph-check-square-offset text-4xl"></i></div>
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Qs Solved Here</p>
                        <p class="text-5xl font-black text-white tracking-tighter">${stats.total}</p>
                    </div>
                    <div class="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-yellow-500/50 transition-colors">
                        <div class="absolute inset-0 bg-yellow-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div class="w-20 h-20 bg-yellow-500/10 rounded-[1.5rem] flex items-center justify-center text-yellow-400 mb-6 border border-yellow-500/20 shadow-inner"><i class="ph-fill ph-lightning text-4xl drop-shadow-sm"></i></div>
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Total App XP</p>
                        <p class="text-5xl font-black text-yellow-400 drop-shadow-md tracking-tighter">${data.xp}</p>
                    </div>
                </div>

                <div class="bg-slate-900 rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden mt-10">
                    <div class="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900 shadow-sm">
                        <h4 class="font-black text-2xl text-white tracking-wide uppercase">${this.escapeHTML(stats.name)} Topics</h4>
                    </div>
                    <div class="p-5 sm:p-8 bg-slate-950 space-y-6">
        `;

        if (stats.topStats.length === 0) html += `<p class="text-slate-600 text-center py-12 font-black uppercase tracking-widest text-sm border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">No topics yet.</p>`;

        stats.topStats.forEach(topic => {
            html += `
                <div class="rounded-2xl border border-slate-800 shadow-lg bg-slate-900 overflow-hidden">
                    <div class="bg-slate-800/80 px-6 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/50 gap-4">
                        <div class="flex items-center gap-3 min-w-0">
                            <button type="button" onclick="app.toggleAnalyticsTopicExpanded('${topic.id}')" aria-expanded="${!collapsedAnalyticsTopicIds.has(topic.id)}" class="shrink-0 p-2 rounded-lg border border-slate-700 bg-slate-950 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition-colors" title="${collapsedAnalyticsTopicIds.has(topic.id) ? 'Expand topic' : 'Collapse topic'}" aria-label="${collapsedAnalyticsTopicIds.has(topic.id) ? 'Expand topic' : 'Collapse topic'}">
                                <i class="ph-bold ${collapsedAnalyticsTopicIds.has(topic.id) ? 'ph-caret-right' : 'ph-caret-down'} text-lg"></i>
                            </button>
                            <h5 class="font-extrabold text-white text-lg flex items-center tracking-tight"><i class="ph-bold ph-folder text-blue-500 mr-3 text-2xl"></i>${this.escapeHTML(topic.name)}</h5>
                        </div>
                        <button onclick="app.showTopicHistoryChart('${topic.id}')" class="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-[0_4px_0_0_#1e3a8a] active:translate-y-1 tracking-widest uppercase border border-blue-500">
                            <i class="ph-bold ph-chart-bar text-lg"></i> Topic History
                        </button>
                    </div>
                    <div class="divide-y divide-slate-800/50 flex flex-col p-3 ${collapsedAnalyticsTopicIds.has(topic.id) ? 'hidden' : ''}">
            `;
            
            if(topic.subStats.length === 0) html += `<p class="text-slate-600 text-center py-8 text-xs font-black uppercase tracking-widest">No subtopics available.</p>`;

            topic.subStats.forEach(subtopic => {
                html += `<div class="p-5 rounded-xl hover:bg-slate-800/50 transition-colors">`;
                html += `
                    <div class="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800/50">
                        <div class="flex items-center gap-3 min-w-0">
                            <button type="button" onclick="app.toggleAnalyticsSubtopicExpanded('${subtopic.id}')" aria-expanded="${!collapsedAnalyticsSubtopicIds.has(subtopic.id)}" class="shrink-0 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition-colors" title="${collapsedAnalyticsSubtopicIds.has(subtopic.id) ? 'Expand subtopic details' : 'Collapse subtopic details'}" aria-label="${collapsedAnalyticsSubtopicIds.has(subtopic.id) ? 'Expand subtopic details' : 'Collapse subtopic details'}">
                                <i class="ph-bold ${collapsedAnalyticsSubtopicIds.has(subtopic.id) ? 'ph-caret-right' : 'ph-caret-down'} text-lg"></i>
                            </button>
                            <i class="ph-fill ph-file-text text-slate-600 text-xl"></i>
                            <span class="font-black text-slate-200 text-lg">${this.escapeHTML(subtopic.name)}</span>
                        </div>
                        <div class="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg shadow-inner whitespace-nowrap">FC Revisions: <span class="text-blue-400 ml-1.5">${subtopic.fcRevs}x</span></div>
                    </div>
                    <div class="${collapsedAnalyticsSubtopicIds.has(subtopic.id) ? 'hidden' : ''}">
                `;
                
                if (subtopic.setStats.length === 0) {
                    html += `<p class="text-slate-600 text-[10px] uppercase font-black tracking-widest pl-10">No question sets attached.</p>`;
                } else {
                    subtopic.setStats.forEach(set => {
                        let historyHtml = "";
                        if (!set.history || set.history.length === 0) {
                            historyHtml = `<span class="text-slate-600 text-[10px] font-black uppercase tracking-widest bg-slate-950 px-4 py-2 rounded-lg border border-slate-800 shadow-inner">No Attempts</span>`;
                        } else {
                            historyHtml = `
                                <button onclick="app.showHistoryChart('${set.id}')" class="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm">
                                    <i class="ph-bold ph-chart-bar text-sm"></i> View History
                                </button>
                            `;
                        }

                        html += `
                            <div class="pl-10 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-2 border-slate-800 ml-4 mb-2">
                                <div class="flex items-center gap-3">
                                    <i class="ph-bold ph-stack text-slate-600 text-lg"></i>
                                    <span class="font-bold text-slate-400 text-base">${this.escapeHTML(set.name)}</span>
                                </div>
                                <div>${historyHtml}</div>
                            </div>
                        `;
                    });
                }
                html += `</div></div>`;
            });
            html += `</div></div>`;
        });
        // Close the selected-subject analytics wrapper, topics content, topics card, and page container.
        html += `</div></div></div></div>`;
        container.innerHTML = html;
    }
});
