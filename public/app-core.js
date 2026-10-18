/* App lifecycle, navigation, shared UI utilities, and generic helpers */
Object.assign(window.app, {
    init() {
        data = this.normalizeData(data);
        this.updateUI();
        this.setView('dashboard');
    },

    normalizeID(value) {
        const id = String(value ?? '');
        return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : generateId();
    },

    normalizeData(source) {
        const normalized = source && typeof source === 'object' && !Array.isArray(source)
            ? source
            : { ...defaultData };

        normalized.subjects = Array.isArray(normalized.subjects) ? normalized.subjects : [];
        const xp = Number(normalized.xp);
        normalized.xp = Number.isFinite(xp) && xp >= 0 ? xp : 0;

        normalized.subjects = normalized.subjects.filter(subject => subject && typeof subject === 'object');
        normalized.subjects.forEach((subject, subjectIndex) => {
            subject.id = this.normalizeID(subject.id);
            subject.name = String(subject.name ?? `Subject ${subjectIndex + 1}`);
            subject.color = typeof subject.color === 'string' ? subject.color : colors[subjectIndex % colors.length];
            subject.topics = Array.isArray(subject.topics) ? subject.topics : [];
            subject.topics = subject.topics.filter(topic => topic && typeof topic === 'object');

            subject.topics.forEach((topic, topicIndex) => {
                topic.id = this.normalizeID(topic.id);
                topic.name = String(topic.name ?? `Topic ${topicIndex + 1}`);
                topic.subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : [];
                topic.subtopics = topic.subtopics.filter(subtopic => subtopic && typeof subtopic === 'object');

                topic.subtopics.forEach((subtopic, subtopicIndex) => {
                    subtopic.id = this.normalizeID(subtopic.id);
                    subtopic.name = String(subtopic.name ?? `Subtopic ${subtopicIndex + 1}`);
                    subtopic.isCompleted = Boolean(subtopic.isCompleted);
                    subtopic.flashcards = Array.isArray(subtopic.flashcards) ? subtopic.flashcards : [];
                    subtopic.questionSets = Array.isArray(subtopic.questionSets) ? subtopic.questionSets : [];
                    const revisions = Number(subtopic.flashcardRevisions);
                    subtopic.flashcardRevisions = Number.isFinite(revisions) && revisions >= 0 ? revisions : 0;

                    subtopic.flashcards = subtopic.flashcards
                        .filter(card => card && typeof card === 'object')
                        .map(card => ({
                            ...card,
                            id: this.normalizeID(card.id),
                            front: String(card.front ?? ''),
                            back: String(card.back ?? ''),
                            img: String(card.img ?? '')
                        }));

                    subtopic.questionSets = subtopic.questionSets.filter(set => set && typeof set === 'object');
                    subtopic.questionSets.forEach((set, setIndex) => {
                        set.id = this.normalizeID(set.id);
                        set.name = String(set.name ?? `Question Set ${setIndex + 1}`);
                        set.questions = Array.isArray(set.questions) ? set.questions : [];
                        set.history = Array.isArray(set.history) ? set.history : [];
                        set.questions = set.questions
                            .filter(question => question && typeof question === 'object')
                            .map(question => ({
                                ...question,
                                id: this.normalizeID(question.id),
                                type: ['mcq', 'msq', 'num'].includes(question.type) ? question.type : 'mcq',
                                text: String(question.text ?? ''),
                                img: String(question.img ?? ''),
                                options: Array.isArray(question.options) ? question.options.map(option => String(option ?? '')) : [],
                                correct: question.correct ?? (question.type === 'msq' ? [] : 0)
                            }));
                    });
                });
            });
        });

        return normalized;
    },

    async save() {
        this.updateXPHeader();
        if (!window.saveUserData) {
            console.warn("User data storage is not initialized.");
            return;
        }
        try {
            await window.saveUserData(data);
        } catch (error) {
            console.error("PrepPro save failed:", error);
        }
    },

    resetAllData() {
        if(confirm("Are you sure? This deletes ALL data permanently.")) {
            data = JSON.parse(JSON.stringify(defaultData));
            collapsedSubjectIds.clear();
            collapsedTopicIds.clear();
            expandedSubtopicIds.clear();
            initializedDashboardSubjectIds.clear();
            initializedDashboardTopicIds.clear();
            collapsedAnalyticsSubjectIds.clear();
            collapsedAnalyticsTopicIds.clear();
            collapsedAnalyticsSubtopicIds.clear();
            initializedAnalyticsSubjectIds.clear();
            initializedAnalyticsTopicIds.clear();
            initializedAnalyticsSubtopicIds.clear();
            isEditMode = true;
            activeAnalyticsSubjectId = null;
            this.save();
            this.setView('dashboard');
            this.showToast("Data wiped completely.", "success");
        }
    },

    toggleMode() {
        isEditMode = !isEditMode;
        this.updateUI();
        this.setView(currentView); 
        this.showToast(isEditMode ? "Creator Mode Active" : "Learner Mode Active", "info");
    },

    updateUI() {
        const modeBtn = document.getElementById('mode-toggle-btn');
        const modeBadge = document.getElementById('mode-badge');
        
        if (isEditMode) {
            modeBtn.innerHTML = `<i class="ph-bold ph-graduation-cap text-lg"></i> Switch to Learner`;
            modeBtn.className = "w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-blue-600/20 text-blue-400 font-extrabold rounded-xl hover:bg-blue-600/30 transition-all shadow-md active:scale-95 border border-blue-500/30 tracking-wide";
            modeBadge.textContent = "Creator";
            modeBadge.className = "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30";
        } else {
            modeBtn.innerHTML = `<i class="ph-bold ph-pencil-simple text-lg"></i> Switch to Creator`;
            modeBtn.className = "w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-slate-800 text-slate-300 font-extrabold rounded-xl hover:bg-slate-700 transition-all shadow-md active:scale-95 border border-slate-700 tracking-wide";
            modeBadge.textContent = "Learner";
            modeBadge.className = "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 border border-slate-700";
        }
        this.updateXPHeader();
    },

    updateXPHeader() {
        document.getElementById('header-xp').textContent = `${data.xp} XP`;
    },

    toggleSidebar(force) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobile-overlay');
        const isOpen = force !== undefined ? force : sidebar.classList.contains('-translate-x-full');
        if (isOpen) {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        } else {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        }
    },

    showToast(msg, type = "info") {
        const toast = document.getElementById('toast');
        document.getElementById('toast-message').textContent = msg;
        const icon = document.getElementById('toast-icon');
        if (type === 'success') icon.innerHTML = `<i class="ph-fill ph-check-circle text-emerald-400 text-2xl"></i>`;
        else if (type === 'error') icon.innerHTML = `<i class="ph-fill ph-warning-circle text-red-400 text-2xl"></i>`;
        else icon.innerHTML = `<i class="ph-fill ph-info text-blue-400 text-2xl"></i>`;

        toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
        setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none'), 3000);
    },

    setView(view, preserveHistory = false) {
        if (!preserveHistory && view !== currentView) {
            if (currentView === 'dashboard' || currentView === 'analytics') viewHistory = [];
            else viewHistory.push(currentView);
        }
        currentView = view;
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('bg-blue-500/10', 'text-blue-400', 'border-blue-500/20', 'shadow-inner');
            btn.classList.add('text-slate-500', 'border-transparent');
        });
        if (['dashboard', 'analytics'].includes(view)) {
            const activeBtn = document.getElementById(`nav-${view}`);
            activeBtn.classList.remove('text-slate-500', 'border-transparent');
            activeBtn.classList.add('bg-blue-500/10', 'text-blue-400', 'border-blue-500/20', 'shadow-inner');
            document.getElementById('back-btn-container').classList.add('hidden');
            document.getElementById('header-title').textContent = view === 'dashboard' ? "Learning Path" : "Analytics";
        } else {
            document.getElementById('back-btn-container').classList.remove('hidden');
        }

        const container = document.getElementById('view-container');
        container.innerHTML = '';
        container.scrollTop = 0;
        
        if (view === 'dashboard') this.renderDashboard(container);
        else if (view === 'analytics') this.renderAnalytics(container);
        else if (view === 'subtopic-editor') this.renderSubtopicEditor(container);
        else if (view === 'set-editor') this.renderSetEditor(container);
        else if (view === 'fc-viewer') this.renderFlashcardViewer(container);
        else if (view === 'quiz-player') this.renderQuizPlayer(container);
        
        this.toggleSidebar(false);
    },

    goBack() {
        if (viewHistory.length > 0) {
            const prev = viewHistory.pop();
            this.setView(prev, true);
        } else {
            this.setView('dashboard');
        }
    },

    showModal(title, contentHTML) {
        const container = document.getElementById('modal-container');
        const content = document.getElementById('modal-content');
        content.innerHTML = `
            <div class="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900 rounded-t-[2rem]">
                <h3 class="font-black text-xl text-white tracking-wide">${this.escapeHTML(title)}</h3>
                <button onclick="app.closeModal()" class="text-slate-500 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"><i class="ph-bold ph-x text-xl"></i></button>
            </div>
            <div class="p-6 sm:p-8 overflow-y-auto bg-slate-900 rounded-b-[2rem]">${contentHTML}</div>
        `;
        container.classList.remove('hidden', 'opacity-0');
        content.classList.remove('scale-95');
        const pasteTarget = content.querySelector('#q-text, #fc-front');
        if (pasteTarget) {
            requestAnimationFrame(() => {
                if (!container.classList.contains('hidden') && pasteTarget.isConnected) {
                    pasteTarget.focus({ preventScroll: true });
                }
            });
        }
    },
    closeModal() { 
        const container = document.getElementById('modal-container');
        const content = document.getElementById('modal-content');
        container.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => container.classList.add('hidden'), 300);
    },

    promptInput(title, label, callback, initialValue = "") {
        const html = `
            <div class="space-y-6">
                <div>
                    <label class="block text-xs font-black text-slate-500 mb-3 uppercase tracking-widest">${this.escapeHTML(label)}</label>
                    <input type="text" id="prompt-input" value="${this.escapeHTML(initialValue)}" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold text-lg shadow-inner">
                </div>
                <button onclick="
                    const val = document.getElementById('prompt-input').value.trim();
                    if(val) { app.closeModal(); ${callback} }
                " class="w-full py-4 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 transition-all shadow-[0_4px_0_0_#1e3a8a] active:translate-y-1 tracking-widest uppercase text-sm">Save</button>
            </div>
        `;
        this.showModal(title, html);
        setTimeout(() => document.getElementById('prompt-input').focus(), 100);
    },
    escapeHTML(value = '') {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    },

    safeImageURL(value = '') {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        try {
            const parsed = new URL(raw);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
            return this.escapeHTML(parsed.href);
        } catch {
            return '';
        }
    },

    // Hierarchy Finders
    isStudySessionActive() {
        return ['fc-viewer', 'quiz-player'].includes(currentView) ||
            !!document.getElementById('session-completion-screen');
    },

    canRefreshFromCloud() {
        const modal = document.getElementById('modal-container');
        return ['dashboard', 'analytics'].includes(currentView) &&
            (!modal || modal.classList.contains('hidden')) &&
            !this.isStudySessionActive();
    },

    refreshCurrentView() {
        this.updateUI();
        this.setView(currentView, true);
    },

});
