/* Learning hierarchy, ordering, creator actions, and learning-path dashboard */
Object.assign(window.app, {
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
        const file = event.clipboardData
            ? (Array.from(event.clipboardData.items || []).find(item => item.type.startsWith('image/'))?.getAsFile()
                || Array.from(event.clipboardData.files || []).find(item => item.type.startsWith('image/')))
            : event.target?.files?.[0];
        if (!file) return;
        if (event.clipboardData) event.preventDefault();
        
        if (file.size > 10 * 1024 * 1024) {
            alert("Image too large! Maximum file size is 10MB.");
            if (event.target?.type === 'file') event.target.value = '';
            return;
        }

        this.imageUploadInProgress = true;
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
        } finally {
            this.imageUploadInProgress = false;
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
                        <div class="relative flex flex-col w-[200px] group cursor-pointer drag-drop-target" ondragover="app.allowDrop(event, 'subtopic', '${topic.id}')" ondrop="app.dropItem(event, 'subtopic', '${st.id}', '${topic.id}')" onclick="app.handleSubtopicClick('${st.id}')">
                            <div class="relative z-10 flex flex-col p-5 rounded-2xl border-2 transition-all duration-300 ${cardStyle} shadow-lg active:scale-95 h-full">
                                <div class="flex justify-between items-start mb-5">
                                    ${icon}
                                    ${isEditMode ? `
                                        <div class="flex gap-1 relative z-20">
                                            <button draggable="true" ondragstart="app.startDrag(event, 'subtopic', '${st.id}', '${topic.id}')" ondragend="app.endDrag(event)" onclick="event.stopPropagation()" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors cursor-grab active:cursor-grabbing" title="Drag to reorder subtopic" aria-label="Drag to reorder subtopic"><i class="ph-bold ph-dots-six-vertical"></i></button>
                                            <button onclick="event.stopPropagation(); app.editSubtopicName('${subject.id}', '${topic.id}', '${st.id}')" class="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors" title="Rename"><i class="ph-fill ph-pencil-simple"></i></button>
                                            <button onclick="event.stopPropagation(); app.deleteSubtopic('${subject.id}', '${topic.id}', '${st.id}')" class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors" title="Delete"><i class="ph-fill ph-trash"></i></button>
                                        </div>
                                    ` : `
                                        <div class="ml-auto flex items-center gap-2 relative z-20">
                                            <input type="checkbox" ${isStComplete ? 'checked' : ''} onclick="event.stopPropagation(); app.toggleSubtopicComplete('${subject.id}', '${topic.id}', '${st.id}')" class="w-6 h-6 accent-emerald-500 cursor-pointer rounded-md bg-slate-800 border-slate-700" title="${isStComplete ? 'Mark Incomplete' : 'Mark Complete'}">
                                        </div>
                                    `}
                                </div>
                                <span class="text-[15px] font-black leading-tight mt-auto flex items-start justify-between gap-2 w-full text-slate-200 group-hover:text-white transition-colors">
                                    <span>${this.escapeHTML(st.name)}</span>
                                </span>
                            </div>
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
});
