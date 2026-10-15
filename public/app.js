const generateId = () => Math.random().toString(36).substr(2, 9);
const colors = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600'];

const defaultData = { subjects: [], xp: 0 };
let data = JSON.parse(JSON.stringify(defaultData));

let isEditMode = true; 
let currentView = 'dashboard';
let viewHistory = [];
let activeSubtopicId = null; 
let activeSetId = null; 
let activeAnalyticsSubjectId = null; 
let editingFlashcardId = null;
let editingQuestionId = null;
// Expansion state is kept in memory; it does not change saved study data.
// Sections are marked as initialized on first render so each one defaults to
// collapsed, but a user's expand/collapse choice is preserved during navigation.
const collapsedSubjectIds = new Set();
const collapsedTopicIds = new Set();
const expandedSubtopicIds = new Set();
const initializedDashboardSubjectIds = new Set();
const initializedDashboardTopicIds = new Set();
// Analytics expansion state is separate from the Learning Path dashboard state.
const collapsedAnalyticsSubjectIds = new Set();
const collapsedAnalyticsTopicIds = new Set();
const collapsedAnalyticsSubtopicIds = new Set();
const initializedAnalyticsSubjectIds = new Set();
const initializedAnalyticsTopicIds = new Set();
const initializedAnalyticsSubtopicIds = new Set();
let studyContext = { type: null, step: 0, score: 0, answers: {}, isFlipped: false, isChecked: false, timeSpent: [], timeRecorded: {}, qStart: 0 };

window.app = {
    tempImageUrl: '',
    
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
    findSubtopic(id) {
        for (let s of data.subjects) {
            for (let t of s.topics) {
                const st = t.subtopics.find(x => x.id === id);
                if (st) return { subtopic: st, topic: t, subject: s };
            }
        }
        return null;
    },
    findSet(subtopicId, setId) {
        const stData = this.findSubtopic(subtopicId);
        if(stData) {
            const set = stData.subtopic.questionSets.find(x => x.id === setId);
            if(set) return set;
        }
        return null;
    },
    findSetByIdAnywhere(setId) {
        for (let s of data.subjects) {
            for (let t of s.topics) {
                for (let st of t.subtopics) {
                    const set = st.questionSets.find(x => x.id === setId);
                    if (set) return set;
                }
            }
        }
        return null;
    },
    findTopicById(topicId) {
        for (let s of data.subjects) {
            const t = s.topics.find(x => x.id === topicId);
            if (t) return t;
        }
        return null;
    },

    // Drag-and-drop reordering for subjects, topics, and subtopics.
    // Items can only be reordered within their current hierarchy level/parent.
    startDrag(event, type, itemId, parentId = null) {
        if (!isEditMode) {
            event.preventDefault();
            return;
        }

        this.draggedItem = { type, itemId, parentId };
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', `${type}:${itemId}`);
        }
        if (event.currentTarget) event.currentTarget.classList.add('opacity-60');
    },

    allowDrop(event, type, parentId = null) {
        const dragged = this.draggedItem;
        if (!dragged || dragged.type !== type || dragged.parentId !== parentId) return;

        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (event.currentTarget) {
            event.currentTarget.classList.add('ring-2', 'ring-blue-500/50');
        }
    },

    dropItem(event, type, targetId, parentId = null) {
        // A nested item may receive the drop event first. If it is not a
        // compatible target, allow the event to bubble to its parent level.
        event.preventDefault();
        const dragged = this.draggedItem;
        if (!dragged || dragged.type !== type || dragged.parentId !== parentId) return;

        event.stopPropagation();
        if (dragged.itemId === targetId) {
            this.endDrag(event);
            return;
        }

        let items = null;
        if (type === 'subject') {
            items = data.subjects;
        } else if (type === 'topic') {
            items = data.subjects.find(subject => subject.id === parentId)?.topics || null;
        } else if (type === 'subtopic') {
            items = this.findTopicById(parentId)?.subtopics || null;
        }

        if (!items) {
            this.endDrag(event);
            return;
        }

        const fromIndex = items.findIndex(item => item.id === dragged.itemId);
        const toIndex = items.findIndex(item => item.id === targetId);
        if (fromIndex === -1 || toIndex === -1) {
            this.endDrag(event);
            return;
        }

        const [movedItem] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, movedItem);
        this.endDrag(event);
        this.save();
        this.setView('dashboard');
        this.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} order updated.`, 'success');
    },

    endDrag(event) {
        if (event?.currentTarget) event.currentTarget.classList.remove('opacity-60');
        document.querySelectorAll('.drag-drop-target').forEach(element => {
            element.classList.remove('ring-2', 'ring-blue-500/50');
        });
        this.draggedItem = null;
    },

    // Additions & Edits
    addSubject() { this.promptInput("New Subject", "Subject Name", "app._saveSubject(val)"); },
    _saveSubject(name) {
        data.subjects.push({ id: generateId(), name, color: colors[data.subjects.length % colors.length], topics: [] });
        this.save(); this.setView('dashboard');
    },

    addTopic(subjectId) { this.promptInput("New Topic", "Topic Name", `app._saveTopic('${subjectId}', val)`); },
    _saveTopic(subjectId, name) {
        const subj = data.subjects.find(s => s.id === subjectId);
        if(subj) { subj.topics.push({ id: generateId(), name, subtopics: [] }); this.save(); this.setView('dashboard'); }
    },

    addSubtopic(subjectId, topicId) { this.promptInput("New Subtopic", "Subtopic Name", `app._saveSubtopic('${subjectId}', '${topicId}', val)`); },
    _saveSubtopic(subjectId, topicId, name) {
        const subj = data.subjects.find(s => s.id === subjectId);
        const topic = subj?.topics.find(t => t.id === topicId);
        if(topic) {
            topic.subtopics.push({ id: generateId(), name, isCompleted: false, flashcards: [], questionSets: [], flashcardRevisions: 0 });
            this.save(); this.setView('dashboard');
        }
    },

    editSubject(id) {
        const s = data.subjects.find(x => x.id === id);
        if(s) this.promptInput("Edit Subject", "Subject Name", `app._updateSubject('${id}', val)`, s.name);
    },
    _updateSubject(id, val) {
        const s = data.subjects.find(x => x.id === id);
        if(s) { s.name = val; this.save(); this.setView('dashboard'); }
    },

    editTopic(sId, tId) {
        const s = data.subjects.find(x => x.id === sId);
        const t = s?.topics.find(x => x.id === tId);
        if(t) this.promptInput("Edit Topic", "Topic Name", `app._updateTopic('${sId}', '${tId}', val)`, t.name);
    },
    _updateTopic(sId, tId, val) {
        const s = data.subjects.find(x => x.id === sId);
        const t = s?.topics.find(x => x.id === tId);
        if(t) { t.name = val; this.save(); this.setView('dashboard'); }
    },

    editSubtopicName(sId, tId, stId) {
        const s = data.subjects.find(x => x.id === sId);
        const t = s?.topics.find(x => x.id === tId);
        const st = t?.subtopics.find(x => x.id === stId);
        if(st) this.promptInput("Edit Subtopic", "Subtopic Name", `app._updateSubtopic('${sId}', '${tId}', '${stId}', val)`, st.name);
    },
    _updateSubtopic(sId, tId, stId, val) {
        const s = data.subjects.find(x => x.id === sId);
        const t = s?.topics.find(x => x.id === tId);
        const st = t?.subtopics.find(x => x.id === stId);
        if(st) { st.name = val; this.save(); this.setView('dashboard'); }
    },

    deleteSubject(id) {
        if(confirm("Delete this subject and all topics inside it?")) {
            data.subjects = data.subjects.filter(x => x.id !== id);
            collapsedSubjectIds.delete(id);
            this.save(); this.setView('dashboard');
        }
    },
    deleteTopic(sId, tId) {
        if(confirm("Delete this topic and all subtopics inside it?")) {
            const s = data.subjects.find(x => x.id === sId);
            if(s) {
                const removedTopic = s.topics.find(x => x.id === tId);
                if (removedTopic) removedTopic.subtopics.forEach(st => expandedSubtopicIds.delete(st.id));
                s.topics = s.topics.filter(x => x.id !== tId);
                collapsedTopicIds.delete(tId);
                this.save(); this.setView('dashboard');
            }
        }
    },
    deleteSubtopic(sId, tId, stId) {
        if(confirm("Delete this subtopic?")) {
            const s = data.subjects.find(x => x.id === sId);
            const t = s?.topics.find(x => x.id === tId);
            if(t) {
                t.subtopics = t.subtopics.filter(x => x.id !== stId);
                expandedSubtopicIds.delete(stId);
                this.save(); this.setView('dashboard');
            }
        }
    },

    toggleSubtopicComplete(subjectId, topicId, subtopicId) {
        const subj = data.subjects.find(s => s.id === subjectId);
        const topic = subj?.topics.find(t => t.id === topicId);
        const st = topic?.subtopics.find(x => x.id === subtopicId);
        if(st) {
            st.isCompleted = !st.isCompleted;
            this.save();
            this.renderDashboard(document.getElementById('view-container'));
        }
    },

    handleSubtopicClick(id) {
        activeSubtopicId = id;
        const stData = this.findSubtopic(id);
        if(!stData) return;
        const st = stData.subtopic;

        if (isEditMode) {
            document.getElementById('header-title').textContent = "Subtopic Editor";
            this.setView('subtopic-editor');
        } else {
            document.getElementById('action-sheet-title').textContent = st.name;
            const contentDiv = document.getElementById('action-sheet-content');
            const fcDone = st.flashcardRevisions > 0;
            
            let html = `
                <button onclick="app.startStudy('flashcards')" class="w-full flex items-center justify-between p-5 bg-slate-800 border border-slate-700 rounded-2xl hover:border-blue-500/50 hover:shadow-lg transition-all group mb-6">
                    <div class="flex items-center gap-4">
                        <div class="w-14 h-14 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center relative border border-blue-500/20">
                            <i class="ph-bold ph-cards text-3xl"></i>
                            ${fcDone ? `<i class="ph-fill ph-check-circle text-emerald-400 absolute -top-2 -right-2 text-xl bg-slate-800 rounded-full"></i>` : ''}
                        </div>
                        <div class="text-left"><p class="font-black text-white text-lg tracking-wide">Master Flashcards</p><p class="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">${st.flashcards.length} cards</p></div>
                    </div>
                    <i class="ph-bold ph-caret-right text-slate-500 group-hover:text-blue-400 text-xl"></i>
                </button>
                <h4 class="text-[10px] font-black text-slate-500 uppercase mb-3 ml-1 tracking-widest">Question Sets</h4>
            `;

            if (st.questionSets.length === 0) {
                html += `<p class="text-xs text-slate-500 font-bold uppercase tracking-widest text-center py-6 bg-slate-800/50 rounded-xl border border-slate-800 border-dashed">No sets available.</p>`;
            } else {
                st.questionSets.forEach(set => {
                    const setDone = set.history && set.history.length > 0;
                    html += `
                        <button onclick="app.startStudy('quiz', '${set.id}')" class="w-full flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-xl hover:border-emerald-500/50 hover:bg-slate-800 transition-all group mb-3 shadow-sm">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center relative border border-emerald-500/20">
                                    <i class="ph-bold ph-target text-xl"></i>
                                    ${setDone ? `<i class="ph-fill ph-check-circle text-emerald-400 absolute -top-1.5 -right-1.5 text-base bg-slate-800 rounded-full"></i>` : ''}
                                </div>
                                <div class="text-left"><p class="font-bold text-slate-200 text-base">${this.escapeHTML(set.name)}</p><p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">${set.questions.length} questions</p></div>
                            </div>
                            <i class="ph-bold ph-caret-right text-slate-600 group-hover:text-emerald-400"></i>
                        </button>
                    `;
                });
            }
            contentDiv.innerHTML = html;
            document.getElementById('action-sheet').classList.remove('hidden');
        }
    },

    async handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) {
            alert("Image too large! Maximum file size is 10MB.");
            event.target.value = '';
            return;
        }

        const preview = document.getElementById('img-preview');
        if (preview) preview.innerHTML = `<p class="text-sm text-blue-400 font-bold mt-4 animate-pulse flex items-center"><i class="ph-bold ph-spinner animate-spin text-xl mr-2"></i>Uploading securely...</p>`;

        const IMGBB_API_KEY = "40b859e541d2f8912f8701563274f12e";
        const formData = new FormData();
        formData.append("image", file);

        try {
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const resData = await response.json();

            if (resData.success) {
                const uploadedURL = this.safeImageURL(resData.data.url);
                if (!uploadedURL) throw new Error('The image service returned an invalid URL.');
                app.tempImageUrl = new URL(resData.data.url).href;
                if (preview) {
                    preview.replaceChildren();
                    const image = document.createElement('img');
                    image.src = app.tempImageUrl;
                    image.alt = 'Uploaded image preview';
                    image.className = 'max-h-40 object-contain rounded-xl shadow-lg border border-slate-700 mt-4 bg-slate-950 p-2';
                    preview.append(image);
                }
            } else {
                throw new Error(resData.error?.message || "Upload rejected.");
            }
        } catch (err) {
            console.error(err);
            app.showToast("Upload failed: " + err.message, "error");
            if (preview) preview.innerHTML = `<p class="text-sm text-red-400 font-bold mt-3 border border-red-500/30 bg-red-500/10 p-2 rounded-lg">Upload failed.</p>`;
        }
    },

    handleImageUrl(url) {
        const raw = String(url ?? '').trim();
        const preview = document.getElementById('img-preview');
        if (!preview) return;

        preview.replaceChildren();
        if (!raw) {
            app.tempImageUrl = '';
            return;
        }

        const safeURL = this.safeImageURL(raw);
        if (!safeURL) {
            app.tempImageUrl = '';
            const message = document.createElement('p');
            message.className = 'text-xs text-red-400 mt-3 font-bold border border-red-500/30 bg-red-500/10 p-2 rounded-lg';
            message.textContent = 'Please enter a valid HTTP or HTTPS image URL.';
            preview.append(message);
            return;
        }

        app.tempImageUrl = new URL(raw).href;
        const image = document.createElement('img');
        image.src = app.tempImageUrl;
        image.alt = 'Image preview';
        image.className = 'max-h-40 object-contain rounded-xl shadow-lg border border-slate-700 mt-4 bg-slate-950 p-2';
        image.onerror = () => {
            app.tempImageUrl = '';
            preview.replaceChildren();
            const message = document.createElement('p');
            message.className = 'text-xs text-red-400 mt-3 font-bold border border-red-500/30 bg-red-500/10 p-2 rounded-lg';
            message.textContent = 'Image URL is broken or inaccessible.';
            preview.append(message);
        };
        preview.append(image);
    },

    // --- Dashboard PRO UI ---
    toggleSubjectExpanded(subjectId) {
        if (collapsedSubjectIds.has(subjectId)) collapsedSubjectIds.delete(subjectId);
        else collapsedSubjectIds.add(subjectId);
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        this.renderDashboard(document.getElementById('view-container'));
        window.scrollTo(0, scrollY);
    },

    toggleTopicExpanded(topicId) {
        if (collapsedTopicIds.has(topicId)) collapsedTopicIds.delete(topicId);
        else collapsedTopicIds.add(topicId);
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        this.renderDashboard(document.getElementById('view-container'));
        window.scrollTo(0, scrollY);
    },

    toggleSubtopicExpanded(subtopicId) {
        if (expandedSubtopicIds.has(subtopicId)) expandedSubtopicIds.delete(subtopicId);
        else expandedSubtopicIds.add(subtopicId);
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        this.renderDashboard(document.getElementById('view-container'));
        window.scrollTo(0, scrollY);
    },

    initializeDashboardExpansionDefaults() {
        data.subjects.forEach(subject => {
            if (!initializedDashboardSubjectIds.has(subject.id)) {
                collapsedSubjectIds.add(subject.id);
                initializedDashboardSubjectIds.add(subject.id);
            }
            subject.topics.forEach(topic => {
                if (!initializedDashboardTopicIds.has(topic.id)) {
                    collapsedTopicIds.add(topic.id);
                    initializedDashboardTopicIds.add(topic.id);
                }
            });
        });
    },

    renderDashboard(container) {
        this.initializeDashboardExpansionDefaults();
        let html = `<div class="max-w-5xl mx-auto space-y-12">`;

        if (data.subjects.length === 0) {
            html += `
                <div class="text-center p-12 bg-slate-900 rounded-3xl border-2 border-dashed border-slate-700 shadow-sm max-w-md mx-auto">
                    <div class="w-20 h-20 bg-blue-500/10 text-blue-400 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-blue-500/20 shadow-inner">
                        <i class="ph-bold ph-folder-plus text-4xl"></i>
                    </div>
                    <h3 class="text-2xl font-black text-white tracking-tight">Your path is empty</h3>
                    <p class="text-slate-400 text-sm mt-2 mb-8 font-medium">Create your first subject to start building.</p>
                    ${isEditMode ? `<button onclick="app.addSubject()" class="px-8 py-4 bg-blue-600 text-white font-extrabold tracking-wide uppercase text-sm rounded-xl shadow-[0_4px_0_0_#1e3a8a] active:translate-y-1 transition-all">+ Add Subject</button>` : `<p class="text-slate-500 text-xs font-black uppercase tracking-widest bg-slate-800 py-3 rounded-lg border border-slate-700">Switch to Creator Mode to add content.</p>`}
                </div>
            `;
        }

        data.subjects.forEach(subject => {
            let subjTotal = 0, subjCompleted = 0;
            subject.topics.forEach(t => {
                subjTotal += t.subtopics.length;
                subjCompleted += t.subtopics.filter(st => st.isCompleted).length;
            });
            let subjProgress = subjTotal === 0 ? 0 : Math.round((subjCompleted/subjTotal)*100);

            html += `
                <div class="relative drag-drop-target" ondragover="app.allowDrop(event, 'subject', null)" ondrop="app.dropItem(event, 'subject', '${subject.id}', null)">
                    <div class="relative bg-slate-900 rounded-[2rem] border border-slate-800 shadow-xl overflow-hidden mb-8 group">
                        <!-- Colored Accent Line -->
                        <div class="absolute left-0 top-0 bottom-0 w-2.5 ${this.escapeHTML(subject.color || 'bg-blue-600')}"></div>
                        
                        <div class="p-8 sm:p-10 flex flex-col sm:flex-row sm:items-start justify-between gap-6 pl-10 sm:pl-12">
                            <div class="flex-1 w-full">
                                <div class="flex items-center gap-3 mb-2">
                                    <button onclick="app.toggleSubjectExpanded('${subject.id}')" aria-expanded="${!collapsedSubjectIds.has(subject.id)}" class="shrink-0 p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors" title="${collapsedSubjectIds.has(subject.id) ? 'Expand subject' : 'Collapse subject'}" aria-label="${collapsedSubjectIds.has(subject.id) ? 'Expand subject' : 'Collapse subject'}">
                                        <i class="ph-bold ${collapsedSubjectIds.has(subject.id) ? 'ph-caret-right' : 'ph-caret-down'} text-lg"></i>
                                    </button>
                                    <h3 class="text-3xl sm:text-4xl font-black text-white tracking-tight">${this.escapeHTML(subject.name)}</h3>
                                    ${isEditMode ? `
                                        <button draggable="true" ondragstart="app.startDrag(event, 'subject', '${subject.id}')" ondragend="app.endDrag(event)" onclick="event.stopPropagation()" class="p-2 bg-slate-800 hover:bg-blue-500/20 border border-slate-700 hover:border-blue-500/40 rounded-lg transition-colors text-slate-400 hover:text-blue-400 shadow-sm cursor-grab active:cursor-grabbing" title="Drag to reorder subject" aria-label="Drag to reorder subject"><i class="ph-bold ph-dots-six-vertical"></i></button>
                                        <button onclick="app.editSubject('${subject.id}')" class="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white shadow-sm" title="Rename"><i class="ph-bold ph-pencil-simple"></i></button>
                                        <button onclick="app.deleteSubject('${subject.id}')" class="p-2 bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/30 rounded-lg transition-colors text-slate-500 hover:text-red-400 shadow-sm" title="Delete"><i class="ph-bold ph-trash"></i></button>
                                    ` : ''}
                                </div>
                                <p class="text-slate-500 font-bold tracking-widest uppercase text-xs">${subject.topics.length} Topics</p>
                                
                                ${!isEditMode && subjTotal > 0 ? `
                                    <div class="mt-8 max-w-sm">
                                        <div class="flex items-center justify-between text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">
                                            <span>Progress</span>
                                            <span class="${this.escapeHTML(subject.color ? subject.color.replace('bg-', 'text-') : 'text-blue-400')}">${subjProgress}%</span>
                                        </div>
                                        <div class="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                                            <div class="h-full ${this.escapeHTML(subject.color || 'bg-blue-600')} rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(255,255,255,0.2)]" style="width: ${subjProgress}%"></div>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                            
                            ${isEditMode ? `
                                <button onclick="app.addTopic('${subject.id}')" class="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-extrabold uppercase tracking-widest rounded-xl transition-all text-xs flex items-center gap-2 shrink-0 border border-slate-700 shadow-sm">
                                    <i class="ph-bold ph-plus text-base"></i> Add Topic
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="relative pl-2 sm:pl-16 flex flex-col gap-10 ${collapsedSubjectIds.has(subject.id) ? 'hidden' : ''}">
                        <div class="skill-path-line hidden sm:block"></div>
            `;

            if(subject.topics.length === 0 && isEditMode) {
                html += `<div class="text-slate-500 italic text-sm ml-16 font-medium">No topics added yet.</div>`;
            }

            subject.topics.forEach(topic => {
                let topTotal = topic.subtopics.length;
                let topCompleted = topic.subtopics.filter(st => st.isCompleted).length;
                let topProgress = topTotal === 0 ? 0 : Math.round((topCompleted/topTotal)*100);

                html += `
                    <div class="w-full z-10 relative drag-drop-target" ondragover="app.allowDrop(event, 'topic', '${subject.id}')" ondrop="app.dropItem(event, 'topic', '${topic.id}', '${subject.id}')">
                        <!-- Topic Header Card -->
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 py-4 px-6 rounded-2xl border border-slate-800 shadow-lg sm:ml-8 mb-6 gap-4 relative">
                            <!-- Connector Dot -->
                            <div class="hidden sm:block absolute -left-[38px] top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-950 border-4 border-slate-800 rounded-full z-10"></div>
                            
                            <div class="flex items-center gap-3">
                                <button onclick="app.toggleTopicExpanded('${topic.id}')" aria-expanded="${!collapsedTopicIds.has(topic.id)}" class="shrink-0 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-400 hover:text-blue-400 hover:border-blue-500/40 transition-colors" title="${collapsedTopicIds.has(topic.id) ? 'Expand topic' : 'Collapse topic'}" aria-label="${collapsedTopicIds.has(topic.id) ? 'Expand topic' : 'Collapse topic'}">
                                    <i class="ph-bold ${collapsedTopicIds.has(topic.id) ? 'ph-caret-right' : 'ph-caret-down'} text-lg"></i>
                                </button>
                                <h4 class="text-xl font-extrabold text-white tracking-wide">${this.escapeHTML(topic.name)}</h4>
                                ${isEditMode ? `
                                    <div class="flex gap-2">
                                        <button draggable="true" ondragstart="app.startDrag(event, 'topic', '${topic.id}', '${subject.id}')" ondragend="app.endDrag(event)" onclick="event.stopPropagation()" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors cursor-grab active:cursor-grabbing" title="Drag to reorder topic" aria-label="Drag to reorder topic"><i class="ph-bold ph-dots-six-vertical"></i></button>
                                        <button onclick="app.editTopic('${subject.id}', '${topic.id}')" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors" title="Rename"><i class="ph-bold ph-pencil-simple"></i></button>
                                        <button onclick="app.deleteTopic('${subject.id}', '${topic.id}')" class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors" title="Delete"><i class="ph-bold ph-trash"></i></button>
                                    </div>
                                ` : ''}
                                ${!isEditMode && topTotal > 0 ? `
                                    <div class="flex items-center gap-2 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
                                        <i class="ph-bold ph-trend-up text-blue-400 text-sm"></i>
                                        <span class="text-xs font-black text-blue-400">${topProgress}%</span>
                                    </div>
                                ` : ''}
                            </div>
                            ${isEditMode ? `
                                <button onclick="app.addSubtopic('${subject.id}', '${topic.id}')" class="px-4 py-2 bg-slate-800 hover:bg-blue-600/20 hover:border-blue-500/30 text-slate-300 hover:text-blue-400 font-black tracking-widest uppercase rounded-xl transition-all text-[10px] flex items-center gap-2 border border-slate-700 shadow-sm">
                                    <i class="ph-bold ph-plus text-sm"></i> Subtopic
                                </button>
                            ` : ''}
                        </div>
                        
                        <div class="flex flex-wrap gap-5 sm:gap-6 ml-4 sm:ml-20 ${collapsedTopicIds.has(topic.id) ? 'hidden' : ''}">
                `;

                if(topic.subtopics.length === 0 && isEditMode) {
                    html += `<div class="text-slate-600 italic text-xs font-bold">No subtopics created.</div>`;
                }

                topic.subtopics.forEach(st => {
                    let isStComplete = !!st.isCompleted;
                    const hasContent = st.flashcards.length > 0 || st.questionSets.some(s => s.questions.length > 0);
                    
                    let cardStyle = "bg-slate-900 border-slate-700 hover:border-blue-500 hover:shadow-[0_0_25px_rgba(59,130,246,0.15)]";
                    if (!isEditMode && isStComplete) {
                        cardStyle = "bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]";
                    } else if (!hasContent && !isEditMode) {
                        cardStyle = "bg-slate-900/50 border-dashed border-slate-800 opacity-50";
                    }

                    let icon = hasContent ? '<div class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-inner"><i class="ph-fill ph-book-open text-blue-400 text-2xl"></i></div>' : '<div class="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700"><i class="ph-bold ph-empty text-slate-500 text-2xl"></i></div>';
                    if(!isEditMode && isStComplete) icon = '<div class="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-inner"><i class="ph-fill ph-check-circle text-emerald-400 text-3xl"></i></div>';

                    html += `
                        <div class="relative flex flex-col ${expandedSubtopicIds.has(st.id) ? 'w-[280px] sm:w-[320px]' : 'w-[200px]'} group cursor-pointer drag-drop-target" ondragover="app.allowDrop(event, 'subtopic', '${topic.id}')" ondrop="app.dropItem(event, 'subtopic', '${st.id}', '${topic.id}')" onclick="app.handleSubtopicClick('${st.id}')">
                            <div class="relative z-10 flex flex-col p-5 rounded-2xl border-2 transition-all duration-300 ${cardStyle} shadow-lg active:scale-95 h-full">
                                <div class="flex justify-between items-start mb-5">
                                    ${icon}
                                    ${isEditMode ? `
                                        <div class="flex gap-1 relative z-20">
                                            <button draggable="true" ondragstart="app.startDrag(event, 'subtopic', '${st.id}', '${topic.id}')" ondragend="app.endDrag(event)" onclick="event.stopPropagation()" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors cursor-grab active:cursor-grabbing" title="Drag to reorder subtopic" aria-label="Drag to reorder subtopic"><i class="ph-bold ph-dots-six-vertical"></i></button>
                                            <button onclick="event.stopPropagation(); app.toggleSubtopicExpanded('${st.id}')" aria-expanded="${expandedSubtopicIds.has(st.id)}" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors" title="${expandedSubtopicIds.has(st.id) ? 'Collapse subtopic details' : 'Expand subtopic details'}" aria-label="${expandedSubtopicIds.has(st.id) ? 'Collapse subtopic details' : 'Expand subtopic details'}"><i class="ph-bold ${expandedSubtopicIds.has(st.id) ? 'ph-caret-up' : 'ph-caret-down'}"></i></button>
                                            <button onclick="event.stopPropagation(); app.editSubtopicName('${subject.id}', '${topic.id}', '${st.id}')" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors" title="Rename"><i class="ph-fill ph-pencil-simple"></i></button>
                                            <button onclick="event.stopPropagation(); app.deleteSubtopic('${subject.id}', '${topic.id}', '${st.id}')" class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors" title="Delete"><i class="ph-fill ph-trash"></i></button>
                                        </div>
                                    ` : `
                                        <div class="ml-auto flex items-center gap-2 relative z-20">
                                            <button onclick="event.stopPropagation(); app.toggleSubtopicExpanded('${st.id}')" aria-expanded="${expandedSubtopicIds.has(st.id)}" class="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-800 transition-colors" title="${expandedSubtopicIds.has(st.id) ? 'Collapse subtopic details' : 'Expand subtopic details'}" aria-label="${expandedSubtopicIds.has(st.id) ? 'Collapse subtopic details' : 'Expand subtopic details'}"><i class="ph-bold ${expandedSubtopicIds.has(st.id) ? 'ph-caret-up' : 'ph-caret-down'}"></i></button>
                                            <input type="checkbox" ${isStComplete ? 'checked' : ''} onclick="event.stopPropagation(); app.toggleSubtopicComplete('${subject.id}', '${topic.id}', '${st.id}')" class="w-6 h-6 accent-emerald-500 cursor-pointer rounded-md bg-slate-800 border-slate-700" title="${isStComplete ? 'Mark Incomplete' : 'Mark Complete'}">
                                        </div>
                                    `}
                                </div>
                                <span class="text-[15px] font-black leading-tight mt-auto flex items-start justify-between gap-2 w-full text-slate-200 group-hover:text-white transition-colors">
                                    <span>${this.escapeHTML(st.name)}</span>
                                </span>
                            </div>
                            ${expandedSubtopicIds.has(st.id) ? `
                                <div class="mt-3 p-4 rounded-2xl border border-slate-700 bg-slate-950/95 shadow-lg text-left space-y-4" onclick="event.stopPropagation()">
                                    <section>
                                        <p class="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Flashcards Ã‚Â· ${st.flashcards.length}</p>
                                        ${st.flashcards.length ? st.flashcards.slice(0, 4).map((fc, cardIndex) => `<p class="text-xs text-slate-300 py-1.5 border-b border-slate-800 last:border-0"><span class="text-slate-600 mr-2">${cardIndex + 1}.</span>${this.escapeHTML(fc.front || 'Untitled flashcard')}</p>`).join('') + (st.flashcards.length > 4 ? `<p class="text-[10px] text-slate-500 font-bold mt-2">+ ${st.flashcards.length - 4} more flashcards</p>` : '') : '<p class="text-xs text-slate-500">No flashcards yet.</p>'}
                                    </section>
                                    <section>
                                        <p class="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">Question Sets Ã‚Â· ${st.questionSets.length}</p>
                                        ${st.questionSets.length ? st.questionSets.map(set => `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800 last:border-0"><span class="text-xs text-slate-300">${this.escapeHTML(set.name)}</span><span class="text-[10px] text-slate-500 shrink-0">${set.questions.length} Q</span></div>`).join('') : '<p class="text-xs text-slate-500">No question sets yet.</p>'}
                                    </section>
                                    <p class="text-[10px] text-slate-500 border-t border-slate-800 pt-3">Click the subtopic card to ${isEditMode ? 'edit its content' : 'open study options'}.</p>
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
                html += `</div></div>`;
            });
            html += `</div></div>`;
        });

        if (isEditMode && data.subjects.length > 0) {
            html += `
                <div class="mt-12 text-center pb-8">
                    <button onclick="app.addSubject()" class="px-8 py-5 border-2 border-dashed border-slate-800 hover:border-blue-500 hover:bg-slate-900 text-slate-500 hover:text-blue-400 font-black rounded-2xl transition-all flex items-center justify-center gap-3 w-full max-w-sm mx-auto shadow-sm tracking-widest uppercase text-sm">
                        <i class="ph-bold ph-plus text-2xl"></i> Add Subject
                    </button>
                </div>
            `;
        }
        container.innerHTML = html + `</div>`;
    },

    // --- Subtopic Editor ---
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
                    <p class="font-black text-white mb-6 text-xl sm:text-2xl leading-snug tracking-tight">${this.escapeHTML(q.text)}</p>
                    
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
                    <label class="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Image Attachment</label>
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
                    <label class="block text-[10px] font-black text-slate-500 mb-2 uppercase tracking-widest">Question Text</label>
                    <textarea id="q-text" rows="2" class="w-full px-5 py-4 rounded-xl border border-slate-700 bg-slate-950 text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none font-bold text-lg shadow-inner">${this.escapeHTML(question?.text || '')}</textarea>
                </div>
                
                <div class="bg-slate-950/50 p-5 rounded-2xl border border-slate-800">
                    <label class="block text-[10px] font-black text-slate-500 mb-3 uppercase tracking-widest">Image Attachment</label>
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
        if(!text) return alert("Question text is required.");

        let qObj = { id: editingQuestionId || generateId(), type, text, img: app.tempImageUrl };
        
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
                        <div class="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-500/30 rounded-[3rem] p-8 sm:p-14 flex flex-col items-center justify-center text-center overflow-hidden shadow-[0_0_50px_rgba(59,130,246,0.15)]">
                            ${this.safeImageURL(card.img) ? `<div class="flex-1 w-full min-h-0 flex items-center justify-center mb-8"><img src="${this.safeImageURL(card.img)}" alt="Flashcard attachment" loading="lazy" class="max-w-full max-h-[400px] object-contain rounded-2xl shadow-xl border border-slate-700 bg-slate-950 p-3"></div>` : ''}
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
            let reveal = isChecked ? `<div class="mt-5 p-4 bg-slate-900 border border-slate-800 rounded-xl font-bold text-slate-400 text-sm sm:text-base tracking-wide uppercase shadow-inner text-center">Correct Answer: <span class="text-emerald-400 ml-2 text-lg sm:text-xl">${this.escapeHTML(q.correct)}</span></div>` : "";
            optionsHtml = `<div class="mt-6"><input type="number" step="any" ${isChecked?'disabled':''} value="${this.escapeHTML(studyContext.answers[studyContext.step] || '')}" oninput="app.selectQuizAnswer(this.value)" class="w-full text-center text-2xl sm:text-3xl font-black py-5 sm:py-6 rounded-2xl border-2 ${style} outline-none shadow-xl transition-all shadow-inner">${reveal}</div>`;
        } else {
            optionsHtml = `<div class="mt-6 space-y-3">`;
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
                optionsHtml += `<button type="button" ${isChecked?'':`onclick="app.selectQuizAnswer(${idx})"`} class="w-full text-left p-4 sm:p-5 rounded-2xl border-2 ${btnStyle} font-bold text-base sm:text-lg leading-snug flex items-center justify-between gap-4 transition-all"><span class="min-w-0 flex-1 break-words">${this.escapeHTML(opt)}</span>${icon}</button>`;
            });
            optionsHtml += `</div>`;
            if(q.type==='msq') optionsHtml += `<p class="mt-4 text-center text-[10px] sm:text-xs font-black text-purple-400 bg-purple-500/10 py-2.5 rounded-xl border border-purple-500/20 uppercase tracking-widest shadow-sm">Select all that apply</p>`;
        }

        let footerHtml = "";
        if (isChecked) {
            const isCorrect = this.evalQuizAnswer(q, studyContext.answers[studyContext.step]);
            const feedback = isCorrect ? `<div class="text-emerald-400 font-black text-lg sm:text-xl uppercase tracking-wider flex items-center gap-2"><i class="ph-fill ph-check-circle text-2xl"></i> Awesome!</div>` : `<div class="text-red-400 font-black text-lg sm:text-xl uppercase tracking-wider flex items-center gap-2"><i class="ph-fill ph-warning-circle text-2xl"></i> Review This.</div>`;
            footerHtml = `<div class="mt-8 pt-5 pb-4 border-t border-slate-800"><div class="flex flex-col sm:flex-row gap-3 items-center justify-between">${feedback}<button type="button" onclick="app.nextQuizQuestion()" class="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-[0_4px_0_0_#065f46] active:translate-y-1 text-base sm:text-lg tracking-widest uppercase transition-all">Continue</button></div></div>`;
        } else {
            const hasAns = (q.type!=='msq'&&q.type!=='num'&&studyContext.answers[studyContext.step]!=null) || (q.type==='msq'&&studyContext.answers[studyContext.step]?.length>0) || (q.type==='num'&&studyContext.answers[studyContext.step]);
            footerHtml = `<div class="mt-8 pt-5 pb-4 border-t border-slate-800"><div class="flex justify-end"><button type="button" ${hasAns?'':'disabled'} onclick="app.checkQuizAnswer()" class="w-full sm:w-auto px-10 sm:px-12 py-3.5 ${hasAns?'bg-blue-600 text-white shadow-[0_4px_0_0_#1e3a8a] hover:bg-blue-500 border border-blue-400':'bg-slate-900 text-slate-700 shadow-[0_4px_0_0_#0f172a] cursor-not-allowed border border-slate-800'} font-black rounded-xl active:translate-y-1 transition-all text-base sm:text-lg uppercase tracking-widest">Check</button></div></div>`;
        }

        container.innerHTML = `
            <div class="quiz-question-scroll max-w-5xl mx-auto flex flex-col pt-3 pb-5 animate-pop"
                 style="height:calc(100vh - 180px);height:calc(100dvh - 180px);max-height:calc(100vh - 180px);max-height:calc(100dvh - 180px);min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;">
                <div class="w-full flex items-center justify-between mb-6 bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-800 shadow-lg shrink-0">
                    <div class="flex-1 h-3 bg-slate-950 rounded-full mr-4 overflow-hidden border border-slate-800 shadow-inner"><div class="h-full bg-emerald-500 transition-all duration-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]" style="width:${progress}%"></div></div>
                    <span class="text-xs font-black text-slate-500 uppercase tracking-widest bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 shadow-inner whitespace-nowrap">Q ${studyContext.step+1} / ${questions.length}</span>
                </div>
                <h2 class="shrink-0 text-2xl sm:text-3xl font-extrabold text-white leading-snug tracking-tight">${this.escapeHTML(q.text)}</h2>
                ${this.safeImageURL(q.img) ? `<img src="${this.safeImageURL(q.img)}" alt="Question illustration" loading="lazy" class="shrink-0 max-w-full max-h-64 sm:max-h-80 object-contain mx-auto my-6 rounded-2xl shadow-xl border border-slate-700 bg-slate-950 p-2" style="max-height:min(32vh, 320px);">` : ''}
                ${optionsHtml}
                ${footerHtml}
                <div class="h-2 shrink-0"></div>
            </div>
        `;
    },
    selectQuizAnswer(val) {
        const q = this.findSet(activeSubtopicId, activeSetId).questions[studyContext.step];
        if (q.type === 'mcq' || q.type === 'num') studyContext.answers[studyContext.step] = val;
        else {
            let arr = studyContext.answers[studyContext.step] || [];
            if (arr.includes(val)) arr = arr.filter(x => x !== val); else arr.push(val);
            studyContext.answers[studyContext.step] = arr;
        }
        this.renderQuizPlayer(document.getElementById('view-container'));
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
        this.renderQuizPlayer(document.getElementById('view-container'));
    },
    nextQuizQuestion() {
        // The Continue button is only available after checking the current answer.
        if (!studyContext.isChecked) return;

        // Safe to call again because recordCurrentQuestionTime() records each index once.
        this.recordCurrentQuestionTime();
        studyContext.isChecked = false;
        studyContext.step++;
        studyContext.qStart = Date.now();
        this.renderQuizPlayer(document.getElementById('view-container'));
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
            <div class="max-w-2xl mx-auto text-center py-24 animate-pop">
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
};
