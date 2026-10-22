/* App lifecycle, navigation, shared UI utilities, and generic helpers */
Object.assign(window.app, {
    init() {
        data = this.normalizeData(data);
        this.applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
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

        const notesSizePresets = {
            A4: { width: 1240, height: 1754 },
            A5: { width: 874, height: 1240 },
            Letter: { width: 1275, height: 1650 },
            Square: { width: 1400, height: 1400 }
        };
        normalized.noteSettings = normalized.noteSettings && typeof normalized.noteSettings === 'object'
            ? normalized.noteSettings
            : {};
        const notesStoredSize = normalized.noteSettings.pageSize && typeof normalized.noteSettings.pageSize === 'object'
            ? normalized.noteSettings.pageSize
            : {};
        const notesPreset = ['A4', 'A5', 'Letter', 'Square', 'Custom'].includes(notesStoredSize.preset)
            ? notesStoredSize.preset
            : 'A4';
        const notesFallbackSize = notesSizePresets[notesPreset] || notesSizePresets.A4;
        const notesWidth = Number(notesStoredSize.width);
        const notesHeight = Number(notesStoredSize.height);
        normalized.noteSettings.pageSize = {
            preset: notesPreset,
            width: Number.isFinite(notesWidth) ? Math.min(2500, Math.max(500, Math.round(notesWidth))) : notesFallbackSize.width,
            height: Number.isFinite(notesHeight) ? Math.min(2500, Math.max(500, Math.round(notesHeight))) : notesFallbackSize.height
        };

        const normalizeNotesBackground = value => {
            if (!value || typeof value !== 'object') return null;
            if (value.type === 'color' && /^#[0-9a-f]{6}$/i.test(String(value.value || ''))) {
                return { type: 'color', value: String(value.value).toLowerCase() };
            }
            if (value.type === 'image' && /^https?:\/\//i.test(String(value.value || ''))) {
                return { type: 'image', value: String(value.value) };
            }
            return null;
        };
        const normalizeNotesBackgroundMap = value => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
            return Object.fromEntries(Object.entries(value)
                .map(([key, background]) => [key, normalizeNotesBackground(background)])
                .filter(entry => entry[1]));
        };
        const notesBackgroundSource = normalized.noteBackgrounds && typeof normalized.noteBackgrounds === 'object'
            ? normalized.noteBackgrounds
            : {};
        normalized.noteBackgrounds = {
            global: normalizeNotesBackground(notesBackgroundSource.global) || { type: 'color', value: '#000000' },
            subjects: normalizeNotesBackgroundMap(notesBackgroundSource.subjects),
            topics: normalizeNotesBackgroundMap(notesBackgroundSource.topics),
            subtopics: normalizeNotesBackgroundMap(notesBackgroundSource.subtopics)
        };

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
                    subtopic.notes = Array.isArray(subtopic.notes) ? subtopic.notes
                        .filter(page => page && typeof page === 'object')
                        .map((page, pageIndex) => {
                            const pageWidth = Number(page.width);
                            const pageHeight = Number(page.height);
                            const background = normalizeNotesBackground(page.background);
                            const imageUrl = String(page.imageUrl ?? '');
                            const legacyText = String(page.text ?? '');
                            const fallbackTextColor = /^#[0-9a-f]{6}$/i.test(String(page.textColor || ''))
                                ? String(page.textColor).toLowerCase()
                                : '#ffffff';
                            const sourceTextBoxes = Array.isArray(page.textBoxes) ? page.textBoxes :
                                (legacyText.trim() ? [{
                                    id: generateId(), x: 4, y: 4, width: 92, height: 30,
                                    text: legacyText, color: fallbackTextColor, fontScale: 2.5
                                }] : []);
                            const textBoxes = sourceTextBoxes
                                .filter(box => box && typeof box === 'object')
                                .slice(0, 500)
                                .map(box => {
                                    const numeric = (value, fallback, min, max) => {
                                        const number = Number(value);
                                        return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
                                    };
                                    const color = /^#[0-9a-f]{6}$/i.test(String(box.color || ''))
                                        ? String(box.color).toLowerCase()
                                        : fallbackTextColor;
                                    return {
                                        id: this.normalizeID(box.id),
                                        x: numeric(box.x, 4, 0, 95),
                                        y: numeric(box.y, 4, 0, 95),
                                        width: numeric(box.width, 42, 5, 100),
                                        height: numeric(box.height, 12, 3, 100),
                                        text: String(box.text ?? ''),
                                        color,
                                        fontScale: numeric(box.fontScale, 2.5, 1, 8)
                                    };
                                });
                            return {
                                ...page,
                                id: this.normalizeID(page.id),
                                title: String(page.title ?? `Page ${pageIndex + 1}`),
                                type: page.type === 'image' ? 'image' : 'canvas',
                                text: '',
                                textBoxes,
                                textColor: fallbackTextColor,
                                imageUrl,
                                imagePageUrl: String(page.imagePageUrl ?? (page.type === 'image' ? imageUrl : '')),
                                foregroundUrl: String(page.foregroundUrl ?? ''),
                                width: Number.isFinite(pageWidth) ? Math.min(2500, Math.max(500, Math.round(pageWidth))) : normalized.noteSettings.pageSize.width,
                                height: Number.isFinite(pageHeight) ? Math.min(2500, Math.max(500, Math.round(pageHeight))) : normalized.noteSettings.pageSize.height,
                                background
                            };
                        })
                        : [];
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
            return true;
        } catch (error) {
            console.error("PrepPro save failed:", error);
            return false;
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

    applyTheme(theme, persist = true) {
        const nextTheme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        document.documentElement.style.colorScheme = nextTheme;
        if (persist) {
            try { localStorage.setItem('preppro-theme', nextTheme); } catch (_) {}
        }
        const isDark = nextTheme === 'dark';
        const button = document.getElementById('theme-toggle-btn');
        const icon = document.getElementById('theme-toggle-icon');
        const label = document.getElementById('theme-toggle-label');
        if (button) {
            button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            button.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
        }
        if (icon) icon.className = `ph-bold ${isDark ? 'ph-sun' : 'ph-moon'} text-lg`;
        if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(nextTheme);
        this.showToast(`Switched to ${nextTheme} mode.`, 'success');
    },

    subjectShareErrorMessage(error) {
        const code = String(error && error.code || "").toLowerCase();
        const message = String(error && error.message || "");
        if (code === "permission-denied" || code === "firestore/permission-denied" ||
            /missing or insufficient permissions/i.test(message)) {
            return "Firestore denied access to subject sharing. Deploy the updated firestore.rules to the prepyproo project with: firebase deploy --only firestore:rules --project prepyproo";
        }
        return message || "The subject-sharing request failed. Please try again.";
    },

    openSubjectShareDialog(subjectId) {
        const subject = data.subjects.find(item => item.id === subjectId);
        if (!subject) return this.showToast('Subject not found.', 'error');
        const html = `
            <div class="space-y-5">
                <p class="text-sm text-slate-400 leading-relaxed">
                    Share <strong class="text-slate-100">${this.escapeHTML(subject.name)}</strong> with another PrepPro user.
                    They can review the request and add a copy to their own learning path.
                </p>
                <form onsubmit="event.preventDefault(); app.sendSubjectShare('${this.escapeHTML(subjectId)}')">
                    <label for="subject-share-email" class="block text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">Receiver email address</label>
                    <input id="subject-share-email" type="email" required autocomplete="email" placeholder="name@example.com"
                        class="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none">
                    <p class="text-xs text-slate-500 mt-2">The receiver must sign in to PrepPro using this email address.</p>
                    <div id="subject-share-status" class="min-h-4 text-xs text-slate-400 mt-3" role="status" aria-live="polite"></div>
                    <button id="subject-share-send" type="submit" class="w-full mt-3 py-3.5 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 transition-all">Send share request</button>
                </form>
            </div>`;
        this.showModal('Share subject', html);
        setTimeout(() => document.getElementById('subject-share-email')?.focus(), 100);
    },

    async sendSubjectShare(subjectId) {
        const subject = data.subjects.find(item => item.id === subjectId);
        const input = document.getElementById('subject-share-email');
        const button = document.getElementById('subject-share-send');
        const status = document.getElementById('subject-share-status');
        if (!subject || !input) return this.showToast('Could not find the subject or email field.', 'error');
        const email = input.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            input.focus();
            return this.showToast('Enter a valid email address.', 'error');
        }
        if (typeof window.createPrepProSubjectShare !== 'function') {
            return this.showToast('Subject sharing is not available. Check your Firebase connection.', 'error');
        }
        if (button) {
            button.disabled = true;
            button.textContent = 'Sending…';
        }
        if (status) status.textContent = 'Sending the subject request…';
        try {
            await window.createPrepProSubjectShare(structuredClone(subject), email);
            this.closeModal();
            this.showToast(`Shared "${subject.name}" with ${email}. The receiver can open it from Shared with me.`, 'success');
        } catch (error) {
            if (button) {
                button.disabled = false;
                button.textContent = 'Send share request';
            }
            const message = this.subjectShareErrorMessage(error);
            if (status) status.textContent = message;
            this.showToast(message, 'error');
        }
    },

    async openSharedSubjectsInbox() {
        this.showModal('Shared with me', '<div id="shared-subject-inbox-content" class="space-y-3"><p class="text-sm text-slate-400">Loading shared subject requests…</p></div>');
        const container = document.getElementById('shared-subject-inbox-content');
        try {
            if (typeof window.listPendingPrepProSubjectShares !== 'function') {
                throw new Error('Subject sharing is not available. Check your Firebase connection.');
            }
            const requests = await window.listPendingPrepProSubjectShares();
            if (!container?.isConnected) return;
            if (!requests.length) {
                container.innerHTML = `
                    <div class="rounded-2xl border border-slate-700 border-dashed bg-slate-950/50 p-8 text-center">
                        <i class="ph-bold ph-inbox text-4xl text-slate-500" aria-hidden="true"></i>
                        <h4 class="text-lg font-black text-slate-200 mt-3">No pending subject requests</h4>
                        <p class="text-sm text-slate-500 mt-2">Subjects shared with your signed-in email will appear here.</p>
                    </div>`;
                return;
            }
            container.innerHTML = requests.map(request => {
                const id = this.escapeHTML(request.id);
                const subjectName = this.escapeHTML(request.subjectName || 'Shared subject');
                const sender = this.escapeHTML(request.senderName || request.senderEmail || 'Another PrepPro user');
                return `
                    <button id="share-request-${id}" type="button" onclick="app.acceptSharedSubject('${id}')"
                        class="w-full text-left rounded-2xl border border-slate-700 bg-slate-800/70 p-4 sm:p-5 hover:border-blue-500/60 hover:bg-blue-500/5 transition-all"
                        aria-label="Add shared subject ${subjectName}">
                        <div class="flex items-start gap-3">
                            <div class="w-11 h-11 shrink-0 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                                <i class="ph-fill ph-folder-notch-open text-2xl" aria-hidden="true"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-[10px] text-blue-400 font-black uppercase tracking-widest">Subject share request</p>
                                <h4 class="font-black text-slate-100 mt-1 break-words">${subjectName}</h4>
                                <p class="text-xs text-slate-400 mt-1">Shared by ${sender}</p>
                                <p class="text-xs text-blue-400 font-extrabold mt-3">Click to add to your learning path →</p>
                            </div>
                        </div>
                    </button>`;
            }).join('');
        } catch (error) {
            if (container?.isConnected) {
                const message = this.subjectShareErrorMessage(error);
                container.innerHTML = `
                    <div class="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
                        <p class="text-sm text-red-300">${this.escapeHTML(message)}</p>
                        <button type="button" onclick="app.openSharedSubjectsInbox()" class="mt-4 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-bold">Try again</button>
                    </div>`;
            }
        }
    },

    async acceptSharedSubject(shareId) {
        const button = document.getElementById('share-request-' + shareId);
        if (button) {
            button.disabled = true;
            button.classList.add('opacity-60');
        }
        try {
            if (typeof window.acceptPrepProSubjectShare !== 'function') {
                throw new Error('Subject sharing is not available. Check your Firebase connection.');
            }
            const result = await window.acceptPrepProSubjectShare(shareId);
            this.closeModal();
            this.setView('dashboard');
            this.showToast(result.alreadyImported
                ? `"${result.subjectName}" was already added to your learning path.`
                : `Added "${result.subjectName}" to your learning path.`, 'success');
        } catch (error) {
            if (button) {
                button.disabled = false;
                button.classList.remove('opacity-60');
            }
            this.showToast(this.subjectShareErrorMessage(error), 'error');
        }
    },

    async importSharedSubject(sourceSubject, shareId) {
        if (!sourceSubject || typeof sourceSubject !== 'object' || !Array.isArray(sourceSubject.topics)) {
            throw new Error('This shared subject has an invalid data format.');
        }
        if (data.subjects.some(subject => subject.sharedShareId === shareId)) return false;
        const importedSubject = structuredClone(sourceSubject);
        const resetAndRekey = value => {
            if (Array.isArray(value)) {
                value.forEach(resetAndRekey);
                return;
            }
            if (!value || typeof value !== 'object') return;
            Object.keys(value).forEach(key => {
                if (key === 'id') value[key] = generateId();
                else if (key === 'isCompleted') value[key] = false;
                else if (key === 'history' && Array.isArray(value[key])) value[key] = [];
                else if (key === 'flashcardRevisions') value[key] = 0;
                else resetAndRekey(value[key]);
            });
        };
        resetAndRekey(importedSubject);
        importedSubject.sharedShareId = String(shareId);
        data.subjects.push(importedSubject);
        const saved = await this.save();
        if (!saved) {
            data.subjects = data.subjects.filter(subject => subject !== importedSubject);
            throw new Error('The shared subject could not be saved. Please try again.');
        }
        return true;
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
        else if (view === 'notes-manager') this.renderNotesManager(container);
        else if (view === 'note-page-editor') this.renderNotePageEditor(container);
        else if (view === 'notes-reader') this.renderNotesReader(container);
        
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
