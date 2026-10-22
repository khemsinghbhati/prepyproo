/* Notes: page ordering, canvas editor, scoped backgrounds, and ImgBB persistence. */
(function () {
    const IMGBB_API_KEY = "40b859e541d2f8912f8701563274f12e";
    const PAGE_SIZES = {
        A4: { preset: "A4", width: 1240, height: 1754 },
        A5: { preset: "A5", width: 874, height: 1240 },
        Letter: { preset: "Letter", width: 1275, height: 1650 },
        Square: { preset: "Square", width: 1400, height: 1400 }
    };

    function getStoredSize() {
        const stored = data.noteSettings && data.noteSettings.pageSize;
        if (stored && Number.isFinite(Number(stored.width)) && Number.isFinite(Number(stored.height))) {
            return {
                preset: String(stored.preset || "A4"),
                width: Math.min(2500, Math.max(500, Math.round(Number(stored.width)))),
                height: Math.min(2500, Math.max(500, Math.round(Number(stored.height))))
            };
        }
        return { ...PAGE_SIZES.A4 };
    }

    function validColor(value) {
        return /^#[0-9a-f]{6}$/i.test(String(value || ""));
    }

    function normalizeBackground(value) {
        if (!value || typeof value !== "object") return null;
        if (value.type === "color" && validColor(value.value)) {
            return { type: "color", value: String(value.value).toLowerCase() };
        }
        if (value.type === "image" && typeof value.value === "string" && /^https?:\/\//i.test(value.value)) {
            return { type: "image", value: value.value };
        }
        return null;
    }

    function getPageImageSize(page) {
        const size = getStoredSize();
        const width = Number(page && page.width);
        const height = Number(page && page.height);
        return {
            width: Number.isFinite(width) && width >= 500 && width <= 2500 ? Math.round(width) : size.width,
            height: Number.isFinite(height) && height >= 500 && height <= 2500 ? Math.round(height) : size.height
        };
    }

    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = function () { resolve(image); };
            image.onerror = function () { reject(new Error("The image could not be loaded for page composition.")); };
            image.src = url;
        });
    }

    function canvasToBlob(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (blob) resolve(blob);
                else reject(new Error("The page could not be converted to an image."));
            }, "image/png");
        });
    }

    let jsPdfLoadPromise = null;

    function loadJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
        if (!jsPdfLoadPromise) {
            jsPdfLoadPromise = new Promise(function (resolve, reject) {
                const script = document.createElement("script");
                script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
                script.async = true;
                script.onload = function () {
                    if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
                    else reject(new Error("The PDF library loaded without its jsPDF module."));
                };
                script.onerror = function () {
                    jsPdfLoadPromise = null;
                    reject(new Error("Could not load the PDF export library. Check your internet connection and retry."));
                };
                document.head.appendChild(script);
            });
        }
        return jsPdfLoadPromise;
    }

    function drawCover(context, image, width, height) {
        const scale = Math.max(width / image.width, height / image.height);
        const sw = width / scale;
        const sh = height / scale;
        const sx = (image.width - sw) / 2;
        const sy = (image.height - sh) / 2;
        context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    }

    function drawContain(context, image, width, height) {
        const scale = Math.min(width / image.width, height / image.height);
        const dw = image.width * scale;
        const dh = image.height * scale;
        context.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
    }

    function drawWrappedText(context, text, color, pageWidth, pageHeight, box) {
        const x = Math.round(pageWidth * Math.max(0, Number(box.x) || 0) / 100);
        const yStart = Math.round(pageHeight * Math.max(0, Number(box.y) || 0) / 100);
        const boxWidth = Math.max(1, Math.round(pageWidth * Math.min(100, Number(box.width) || 42) / 100));
        const boxHeight = Math.max(1, Math.round(pageHeight * Math.min(100, Number(box.height) || 12) / 100));
        const fontSize = Math.max(14, Math.round(pageWidth * Math.min(8, Math.max(1, Number(box.fontScale) || 2.5)) / 100));
        const margin = Math.max(2, Math.round(fontSize * 0.15));
        const lineHeight = Math.round(fontSize * 1.35);
        const right = Math.min(pageWidth, x + boxWidth) - margin;
        const bottom = Math.min(pageHeight, yStart + boxHeight) - margin;
        context.save();
        context.beginPath();
        context.rect(x, yStart, boxWidth, boxHeight);
        context.clip();
        context.fillStyle = validColor(color) ? color : "#ffffff";
        context.font = "500 " + fontSize + "px Inter, Arial, sans-serif";
        context.textBaseline = "top";
        context.textAlign = "left";
        let y = yStart + margin;
        String(text || "").split(/\r?\n/).forEach(function (paragraph) {
            if (!paragraph) {
                y += lineHeight;
                return;
            }
            let line = "";
            paragraph.split(/\s+/).forEach(function (word) {
                const candidate = line ? line + " " + word : word;
                if (line && context.measureText(candidate).width > right - x - margin) {
                    if (y + lineHeight <= bottom) context.fillText(line, x + margin, y, right - x - margin);
                    y += lineHeight;
                    line = word;
                } else {
                    line = candidate;
                }
            });
            if (line && y + lineHeight <= bottom) {
                context.fillText(line, x + margin, y, right - x - margin);
                y += lineHeight;
            }
        });
        context.restore();
    }

    Object.assign(window.app, {
        openNotes() {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return this.showToast("Subtopic not found.", "error");
            // This overlay otherwise remains above the notes view in Learner mode.
            document.getElementById("action-sheet")?.classList.add("hidden");
            if (isEditMode) {
                this.setView("notes-manager");
            } else {
                this.notesReaderIndex = 0;
                this.setView("notes-reader");
            }
        },

        async exportNotesPDF() {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return this.showToast("Subtopic not found.", "error");
            const pages = Array.isArray(stData.subtopic.notes) ? stData.subtopic.notes : [];
            if (!pages.length) return this.showToast("There are no notes pages to export.", "error");

            this.showToast("Preparing your notes PDF…", "info");
            try {
                const JsPDF = await loadJsPDF();
                let pdf = null;
                for (let index = 0; index < pages.length; index += 1) {
                    const page = pages[index];
                    const dimensions = getPageImageSize(page);
                    const canvas = document.createElement("canvas");
                    canvas.width = dimensions.width;
                    canvas.height = dimensions.height;
                    const context = canvas.getContext("2d");
                    if (!context) throw new Error("The notes page canvas could not be created.");

                    const background = this.getNoteBackground(stData, page);
                    if (background.type === "image") {
                        const backgroundImage = await loadImage(background.value);
                        drawCover(context, backgroundImage, dimensions.width, dimensions.height);
                    } else {
                        context.fillStyle = validColor(background.value) ? background.value : "#000000";
                        context.fillRect(0, 0, dimensions.width, dimensions.height);
                    }
                    const pageImageUrl = page.imagePageUrl || page.imageUrl;
                    if (pageImageUrl) {
                        const pageImage = await loadImage(pageImageUrl);
                        drawContain(context, pageImage, dimensions.width, dimensions.height);
                    }
                    if (page.foregroundUrl) {
                        const inkImage = await loadImage(page.foregroundUrl);
                        drawContain(context, inkImage, dimensions.width, dimensions.height);
                    }
                    (Array.isArray(page.textBoxes) ? page.textBoxes : []).forEach(box => {
                        drawWrappedText(context, box.text || "", box.color || this.getNoteTextColor(stData, page),
                            dimensions.width, dimensions.height, box);
                    });

                    const orientation = dimensions.width >= dimensions.height ? "landscape" : "portrait";
                    const format = [dimensions.width, dimensions.height];
                    if (!pdf) {
                        pdf = new JsPDF({ orientation, unit: "px", format, compress: true, hotfixes: ["px_scaling"] });
                    } else {
                        pdf.addPage(format, orientation);
                    }
                    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, dimensions.width, dimensions.height, undefined, "FAST");
                }
                const safePart = value => String(value || "Notes").normalize("NFKD")
                    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "Notes";
                pdf.save("PrepPro-" + safePart(stData.subject.name) + "-" + safePart(stData.subtopic.name) + "-notes.pdf");
                this.showToast("Notes PDF exported.", "success");
            } catch (error) {
                console.error("Notes PDF export failed:", error);
                this.showToast(error.message || "Could not export notes to PDF.", "error");
            }
        },

        getNoteBackground(stData, page) {
            const settings = data.noteBackgrounds || {};
            const candidates = [
                page && page.background,
                settings.subtopics && stData && settings.subtopics[stData.subtopic.id],
                settings.topics && stData && settings.topics[stData.topic.id],
                settings.subjects && stData && settings.subjects[stData.subject.id],
                settings.global
            ];
            for (let i = 0; i < candidates.length; i += 1) {
                const config = normalizeBackground(candidates[i]);
                if (config) return config;
            }
            return { type: "color", value: "#000000" };
        },

        getNoteBackgroundForScope(scope, stData, page) {
            const settings = data.noteBackgrounds || {};
            let config = null;
            if (scope === "page") config = page && page.background;
            else if (scope === "subtopic") config = settings.subtopics && settings.subtopics[stData.subtopic.id];
            else if (scope === "topic") config = settings.topics && settings.topics[stData.topic.id];
            else if (scope === "subject") config = settings.subjects && settings.subjects[stData.subject.id];
            else config = settings.global;
            return normalizeBackground(config) || this.getNoteBackground(stData, page);
        },

        noteBackgroundStyle(config) {
            const bg = normalizeBackground(config) || { type: "color", value: "#000000" };
            if (bg.type === "image") {
                return "background-color:#000000;background-image:url('" + this.escapeHTML(bg.value) + "');background-size:cover;background-position:center;background-repeat:no-repeat;";
            }
            return "background-color:" + bg.value + ";";
        },

        getNoteTextColor(stData, page) {
            const bg = this.getNoteBackground(stData, page);
            if (page && validColor(page.textColor)) {
                if (bg.type === "color" && bg.value.toLowerCase() === "#ffffff" && page.textColor.toLowerCase() === "#ffffff") return "#111827";
                return page.textColor;
            }
            return bg.type === "color" && bg.value.toLowerCase() === "#ffffff" ? "#111827" : "#ffffff";
        },

        renderNoteLayers(stData, page, preview) {
            const bg = this.getNoteBackground(stData, page);
            const dimensions = getPageImageSize(page);
            const ratio = dimensions.width + " / " + dimensions.height;
            const style = "aspect-ratio:" + ratio + ";" + this.noteBackgroundStyle(bg);
            const sizeClass = preview ? " notes-page-preview" : " notes-page-reader";
            let html = '<div class="notes-layered-page' + sizeClass + '" style="' + style + '">';
            if (page.imagePageUrl) {
                html += '<img class="notes-layer-base" src="' + this.safeImageURL(page.imagePageUrl) + '" alt="Uploaded notes page">';
            }
            if (page.foregroundUrl) {
                html += '<img class="notes-layer-ink" src="' + this.safeImageURL(page.foregroundUrl) + '" alt="" aria-hidden="true">';
            }
            html += this.renderNoteTextBoxes(page, false);
            html += '</div>';
            return html;
        },

        renderNoteTextBoxes(page, editable) {
            const boxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
            return boxes.map(box => {
                const id = this.escapeHTML(box.id);
                const style = 'left:' + Number(box.x || 0) + '%;top:' + Number(box.y || 0) +
                    '%;width:' + Number(box.width || 42) + '%;height:' + Number(box.height || 12) +
                    '%;color:' + this.escapeHTML(box.color || '#ffffff') +
                    ';--notes-text-scale:' + Number(box.fontScale || 2.5) + ';';
                if (!editable) {
                    return '<div class="notes-render-text-box" style="' + style + '">' +
                        this.escapeHTML(box.text || '') + '</div>';
                }
                return '<div class="notes-text-box-editor" data-text-box-id="' + id + '" style="' + style + '">' +
                    '<div class="notes-text-box-handle" onpointerdown="app.startMoveNoteTextBox(event,\'' + id + '\')" onclick="event.stopPropagation()" title="Drag to move text">↕ Move</div>' +
                    '<button class="notes-text-box-delete" type="button" title="Delete text" aria-label="Delete text" onclick="event.stopPropagation(); app.deleteNoteTextBox(\'' + id + '\')">×</button>' +
                    '<textarea aria-label="Text on page" spellcheck="true" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation()" ' +
                    'onfocus="app.selectNoteTextBox(\'' + id + '\')" oninput="app.updateNoteTextBox(\'' + id + '\', this.value)">' +
                    this.escapeHTML(box.text || '') + '</textarea></div>';
            }).join('');
        },

        renderNotesManager(container) {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return this.setView("dashboard");
            const st = stData.subtopic;
            const size = getStoredSize();
            let html = '<div class="max-w-7xl mx-auto notes-view">' +
                '<div class="notes-heading-card">' +
                '<div><p class="notes-eyebrow">SUBTOPIC NOTES</p><h1>' + this.escapeHTML(st.name) + '</h1>' +
                '<p class="notes-muted">Create pages, write, draw, and organize your notes.</p></div>' +
                '<div class="notes-heading-actions"><button class="notes-button notes-button-secondary" onclick="app.exportNotesPDF()"><i class="ph-bold ph-file-pdf"></i> Export PDF</button>' +
                '<button class="notes-button notes-button-primary" onclick="app.addNotePage()">+ Blank Page</button>' +
                '<label class="notes-button notes-button-secondary" for="notes-page-file">Upload Image Page</label>' +
                '<input id="notes-page-file" class="notes-visually-hidden" type="file" accept="image/*" onchange="app.uploadNotePageFile(event)"></div></div>' +
                '<section class="notes-settings-panel"><div><h2>Page settings</h2><p class="notes-muted">Size is the default for new pages. You can resize the page you are editing too.</p></div>' +
                '<div class="notes-settings-controls"><label>Default page size<select id="notes-page-size" onchange="app.changeNotePageSize(this.value)">' +
                this.notePageSizeOptions(size.preset) + '</select></label>';
            if (size.preset === "Custom") {
                html += '<label>Width (px)<input id="notes-custom-width" type="number" min="500" max="2500" value="' + size.width + '"></label>' +
                    '<label>Height (px)<input id="notes-custom-height" type="number" min="500" max="2500" value="' + size.height + '"></label>' +
                    '<button class="notes-button notes-button-secondary" onclick="app.applyCustomNotePageSize()">Apply custom size</button>';
            }
            html += '</div></section><div class="notes-pages-header"><h2>Pages <span>' + st.notes.length + '</span></h2>' +
                '<p class="notes-muted">Use the arrows to reorder pages, or insert a blank page before any page.</p></div>';
            if (!st.notes.length) {
                html += '<div class="notes-empty"><i class="ph-bold ph-notebook text-4xl"></i><h3>No notes yet</h3>' +
                    '<p>Add a blank page to type or draw, or upload an image as a page.</p>' +
                    '<button class="notes-button notes-button-primary" onclick="app.addNotePage()">Create the first page</button></div>';
            } else {
                html += '<div class="notes-page-grid">';
                st.notes.forEach((page, index) => {
                    html += '<article class="notes-page-card"><button class="notes-preview-button" title="Open page ' + (index + 1) + '" onclick="app.editNotePage(\'' + page.id + '\')">' +
                        this.renderNoteLayers(stData, page, true) + '</button><div class="notes-page-card-footer">' +
                        '<div><strong>' + this.escapeHTML(page.title || ("Page " + (index + 1))) + '</strong><span>' +
                        (page.type === "image" ? "Image page" : "Drawn / typed page") + '</span></div><div class="notes-page-actions">' +
                        '<button aria-label="Move page up" title="Move up" ' + (index === 0 ? "disabled" : "") + ' onclick="app.moveNotePage(\'' + page.id + '\',-1)">↑</button>' +
                        '<button aria-label="Move page down" title="Move down" ' + (index === st.notes.length - 1 ? "disabled" : "") + ' onclick="app.moveNotePage(\'' + page.id + '\',1)">↓</button>' +
                        '<button aria-label="Insert page before" title="Insert page before" onclick="app.insertNotePage(' + index + ')">＋</button>' +
                        '<button aria-label="Delete page" title="Delete page" class="notes-delete-page" onclick="app.deleteNotePage(\'' + page.id + '\')">×</button></div></div>' +
                        '<button class="notes-button notes-open-page" onclick="app.editNotePage(\'' + page.id + '\')">Open / Edit Page</button></article>';
                });
                html += '</div>';
            }
            html += '<div class="notes-bottom-actions"><button class="notes-button notes-button-secondary" onclick="app.goBack()">Back to subtopic</button>' +
                '<button class="notes-button notes-button-primary" onclick="app.addNotePage()">+ Add Page</button></div></div>';
            container.innerHTML = html;
        },

        notePageSizeOptions(selected) {
            const options = [
                ["A4", "A4 (default)"],
                ["A5", "A5"],
                ["Letter", "US Letter"],
                ["Square", "Square"],
                ["Custom", "Custom"]
            ];
            return options.map(option => '<option value="' + option[0] + '" ' + (selected === option[0] ? "selected" : "") + '>' + option[1] + '</option>').join("");
        },

        changeNotePageSize(preset) {
            if (PAGE_SIZES[preset]) {
                data.noteSettings.pageSize = { ...PAGE_SIZES[preset] };
            } else if (preset === "Custom") {
                const current = getStoredSize();
                data.noteSettings.pageSize = { preset: "Custom", width: current.width, height: current.height };
            }
            this.save();
            this.setView("notes-manager", true);
        },

        applyCustomNotePageSize() {
            const width = Math.min(2500, Math.max(500, Math.round(Number(document.getElementById("notes-custom-width")?.value))));
            const height = Math.min(2500, Math.max(500, Math.round(Number(document.getElementById("notes-custom-height")?.value))));
            if (!Number.isFinite(width) || !Number.isFinite(height)) return this.showToast("Enter a valid width and height.", "error");
            data.noteSettings.pageSize = { preset: "Custom", width, height };
            this.save();
            this.setView("notes-manager", true);
            this.showToast("Default note page size updated.", "success");
        },

        makeNotePage(index) {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return null;
            const size = getStoredSize();
            const page = {
                id: generateId(),
                title: "Page " + (stData.subtopic.notes.length + 1),
                type: "canvas",
                text: "",
                textColor: "#ffffff",
                textBoxes: [],
                imageUrl: "",
                imagePageUrl: "",
                foregroundUrl: "",
                width: size.width,
                height: size.height,
                background: null,
                createdAt: Date.now()
            };
            if (typeof index === "number" && index >= 0 && index <= stData.subtopic.notes.length) {
                stData.subtopic.notes.splice(index, 0, page);
            } else {
                stData.subtopic.notes.push(page);
            }
            return page;
        },

        addNotePage() {
            const page = this.makeNotePage();
            if (!page) return;
            this.save();
            this.editNotePage(page.id);
        },

        insertNotePage(index) {
            const page = this.makeNotePage(index);
            if (!page) return;
            this.save();
            this.editNotePage(page.id);
        },

        editNotePage(pageId) {
            const stData = this.findSubtopic(activeSubtopicId);
            const page = stData && stData.subtopic.notes.find(item => item.id === pageId);
            if (!page) return this.showToast("Notes page not found.", "error");
            this.currentNotePageId = page.id;
            const legacyBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
            this.noteDraft = {
                mode: "draw",
                inkColor: this.getNoteTextColor(stData, page),
                brushSize: 5,
                drawing: false,
                inkChanged: false,
                loadingInk: Boolean(page.foregroundUrl),
                textBoxes: structuredClone(legacyBoxes),
                selectedTextBoxId: null
            };
            this.setView("note-page-editor");
        },

        returnToNotesManager() {
            if (Array.isArray(viewHistory) && viewHistory[viewHistory.length - 1] === "notes-manager") viewHistory.pop();
            this.setView("notes-manager", true);
        },

        moveNotePage(pageId, direction) {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return;
            const pages = stData.subtopic.notes;
            const index = pages.findIndex(page => page.id === pageId);
            const target = index + Number(direction);
            if (index < 0 || target < 0 || target >= pages.length) return;
            const moved = pages.splice(index, 1)[0];
            pages.splice(target, 0, moved);
            this.save();
            this.setView("notes-manager", true);
        },

        deleteNotePage(pageId) {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return;
            const page = stData.subtopic.notes.find(item => item.id === pageId);
            if (!page || !confirm("Delete this notes page? This removes it from PrepPro but cannot delete its already-uploaded ImgBB image.")) return;
            stData.subtopic.notes = stData.subtopic.notes.filter(item => item.id !== pageId);
            this.save();
            this.setView("notes-manager", true);
            this.showToast("Notes page deleted.", "success");
        },

        renderNotesReader(container) {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return this.setView("dashboard");
            const pages = stData.subtopic.notes || [];
            if (!pages.length) {
                container.innerHTML = '<div class="notes-empty"><h3>No notes available</h3><p>Switch to Creator Mode to add pages.</p><button class="notes-button notes-button-secondary" onclick="app.goBack()">Back</button></div>';
                return;
            }
            this.notesReaderIndex = Math.min(Math.max(0, Number(this.notesReaderIndex) || 0), pages.length - 1);
            const index = this.notesReaderIndex;
            const page = pages[index];
            container.innerHTML = '<div class="max-w-5xl mx-auto notes-view notes-reader-view"><div class="notes-reader-heading">' +
                '<div><p class="notes-eyebrow">' + this.escapeHTML(stData.subject.name) + ' / ' + this.escapeHTML(stData.topic.name) + '</p>' +
                '<h1>' + this.escapeHTML(stData.subtopic.name) + '</h1><p class="notes-muted">Page ' + (index + 1) + ' of ' + pages.length + '</p></div>' +
                '<span class="notes-page-number">' + (index + 1) + ' / ' + pages.length + '</span></div>' +
                '<div class="notes-reader-paper">' + this.renderNoteLayers(stData, page, false) + '</div>' +
                '<div class="notes-reader-controls"><button class="notes-button notes-button-secondary" ' + (index === 0 ? "disabled" : "") + ' onclick="app.navigateNoteReader(-1)">← Previous</button>' +
                '<button class="notes-button notes-button-secondary" onclick="app.exportNotesPDF()"><i class="ph-bold ph-file-pdf"></i> Export PDF</button>' +
                '<button class="notes-button notes-button-secondary" onclick="app.goBack()">Back to subtopic</button>' +
                '<button class="notes-button notes-button-primary" ' + (index === pages.length - 1 ? "disabled" : "") + ' onclick="app.navigateNoteReader(1)">Next →</button></div></div>';
        },

        navigateNoteReader(direction) {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return;
            const next = Number(this.notesReaderIndex || 0) + Number(direction);
            if (next < 0 || next >= stData.subtopic.notes.length) return;
            this.notesReaderIndex = next;
            this.setView("notes-reader", true);
        },

        renderNotePageEditor(container) {
            const stData = this.findSubtopic(activeSubtopicId);
            const page = stData && stData.subtopic.notes.find(item => item.id === this.currentNotePageId);
            if (!stData || !page) return this.setView("notes-manager");
            const dimensions = getPageImageSize(page);
            const bg = this.getNoteBackground(stData, page);
            const textColor = this.getNoteTextColor(stData, page);
            const size = getStoredSize();
            const pageSizePreset = Object.keys(PAGE_SIZES).find(name =>
                PAGE_SIZES[name].width === dimensions.width && PAGE_SIZES[name].height === dimensions.height
            ) || "Custom";
            let html = '<div class="max-w-7xl mx-auto notes-view notes-editor-view">' +
                '<div class="notes-editor-header"><div><p class="notes-eyebrow">NOTES PAGE EDITOR</p><h1>' + this.escapeHTML(stData.subtopic.name) + '</h1>' +
                '<p class="notes-muted">Draw freely. Choose T, then click anywhere on the page to insert a movable text box.</p></div>' +
                '<div class="notes-heading-actions"><button class="notes-button notes-button-secondary" onclick="app.returnToNotesManager()">Cancel / Back</button>' +
                '<button class="notes-button notes-button-primary" onclick="app.saveNotePage()">Confirm & Save Page</button></div></div>' +
                '<div class="notes-editor-layout"><aside class="notes-toolbar">' +
                '<div class="notes-tool-group"><span class="notes-tool-label">Tools</span><button id="note-tool-text" class="notes-tool-button" aria-pressed="false" onclick="app.setNoteTool(\'text\')">T&nbsp; Add text</button>' +
                '<button id="note-tool-draw" class="notes-tool-button is-active" aria-pressed="true" onclick="app.setNoteTool(\'draw\')">✎ Draw</button>' +
                '<button id="note-tool-erase" class="notes-tool-button" aria-pressed="false" onclick="app.setNoteTool(\'erase\')">⌫ Erase strokes</button></div>' +
                '<label class="notes-tool-field">Pen / selected text colour<input id="note-ink-color" type="color" value="' + textColor + '" oninput="app.updateNoteInkColor(this.value)"></label>' +
                '<label class="notes-tool-field">Brush size<input type="range" min="2" max="28" value="5" oninput="app.setNoteBrushSize(this.value)"></label>' +
                '<label class="notes-tool-field">Selected text size<input id="note-text-scale" type="range" min="1" max="8" step="0.25" value="2.5" oninput="app.setNoteTextScale(this.value)"></label>' +
                '<label class="notes-tool-field">Page size<select id="note-current-size" onchange="app.resizeCurrentNotePage(this.value)">' + this.notePageSizeOptions(pageSizePreset) + '</select></label>' +
                '<p class="notes-tool-hint">The size menu changes this page and the default for new pages.</p>' +
                '<div class="notes-background-tools"><span class="notes-tool-label">Page background</span>' +
                '<label class="notes-tool-field">Apply to<select id="notes-bg-scope" onchange="app.syncNoteBackgroundControls(this.value)">' +
                '<option value="all">All pages in all subjects</option><option value="subject">This subject</option><option value="topic">This topic</option>' +
                '<option value="subtopic" selected>This subtopic</option><option value="page">This page only</option></select></label>' +
                '<label class="notes-tool-field">Classic background<select id="notes-bg-color"><option value="#000000">Black (default)</option><option value="#ffffff">White</option></select></label>' +
                '<button class="notes-button notes-button-secondary notes-full-button" onclick="app.applyNoteColorBackground()">Apply colour background</button>' +
                '<label class="notes-button notes-button-secondary notes-full-button" for="notes-bg-file">Upload custom background</label>' +
                '<input id="notes-bg-file" class="notes-visually-hidden" type="file" accept="image/*" onchange="app.uploadNoteBackgroundFile(event)">' +
                '<p class="notes-tool-hint">A scope background updates pages at that level unless a more specific background overrides it.</p></div></aside>' +
                '<div class="notes-canvas-column"><div class="notes-canvas-instructions"><span>Draw with your mouse, finger or stylus. Choose T and click the page to add text. Drag a text box by its Move handle.</span></div>' +
                '<div class="notes-page-stage" id="notes-page-stage" onclick="app.handleNoteStageClick(event)" style="aspect-ratio:' + dimensions.width + ' / ' + dimensions.height + ';">' +
                '<div id="notes-page-background" class="notes-page-background" style="' + this.noteBackgroundStyle(bg) + '"></div>';
            if (page.imagePageUrl) {
                html += '<img id="notes-page-image-base" class="notes-page-image-base" src="' + this.safeImageURL(page.imagePageUrl) + '" alt="Uploaded image page">';
            }
            html += '<canvas id="notes-draw-canvas" width="' + dimensions.width + '" height="' + dimensions.height + '" aria-label="Drawing canvas"></canvas>' +
                '<div id="notes-text-box-layer">' + this.renderNoteTextBoxes({ textBoxes: this.noteDraft.textBoxes || [] }, true) + '</div></div>' +
                '<div class="notes-save-row"><button class="notes-button notes-button-secondary" onclick="app.clearNoteStrokes()">Clear all pen strokes</button>' +
                '<span id="notes-save-status" role="status">Your changes upload to ImgBB when you confirm the page.</span>' +
                '<button class="notes-button notes-button-primary" onclick="app.saveNotePage()">Confirm & Save Page</button></div></div></div></div>';
            container.innerHTML = html;
            this.setupNoteCanvas(page, dimensions);
            this.syncNoteBackgroundControls("subtopic");
        },

        setupNoteCanvas(page, dimensions) {
            const canvas = document.getElementById("notes-draw-canvas");
            if (!canvas) return;
            const context = canvas.getContext("2d");
            if (!this.noteDraft) this.noteDraft = {
                mode: "draw", inkColor: "#ffffff", brushSize: 5, drawing: false,
                inkChanged: false, loadingInk: false, textBoxes: structuredClone(page.textBoxes || []),
                selectedTextBoxId: null
            };
            this.noteDraft.drawing = false;
            if (page.foregroundUrl) {
                this.noteDraft.loadingInk = true;
                canvas.style.pointerEvents = "none";
                loadImage(page.foregroundUrl).then(image => {
                    if (!canvas.isConnected) return;
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
                    if (this.noteDraft) this.noteDraft.inkLoadFailed = false;
                }).catch(error => {
                    console.warn("Could not load saved note strokes:", error);
                    if (this.noteDraft) this.noteDraft.inkLoadFailed = true;
                    this.showToast("Saved drawing could not be loaded. Reopen this page when online before saving.", "error");
                }).finally(() => {
                    if (!canvas.isConnected) return;
                    if (this.noteDraft) this.noteDraft.loadingInk = false;
                    this.setNoteTool(this.noteDraft ? this.noteDraft.mode : "draw");
                });
            } else {
                context.clearRect(0, 0, canvas.width, canvas.height);
            }
            canvas.onpointerdown = event => {
                if (!this.noteDraft || !["draw", "erase"].includes(this.noteDraft.mode) || this.noteDraft.loadingInk) return;
                event.preventDefault();
                this.noteDraft.drawing = true;
                this.noteDraft.inkChanged = true;
                canvas.setPointerCapture(event.pointerId);
                const rect = canvas.getBoundingClientRect();
                const x = (event.clientX - rect.left) * canvas.width / rect.width;
                const y = (event.clientY - rect.top) * canvas.height / rect.height;
                context.beginPath();
                context.moveTo(x, y);
                context.lineCap = "round";
                context.lineJoin = "round";
                context.lineWidth = Number(this.noteDraft.brushSize || 5) * canvas.width / Math.max(1, rect.width);
                context.strokeStyle = this.noteDraft.inkColor || "#ffffff";
                context.globalCompositeOperation = this.noteDraft.mode === "erase" ? "destination-out" : "source-over";
                context.lineTo(x + 0.1, y + 0.1);
                context.stroke();
            };
            canvas.onpointermove = event => {
                if (!this.noteDraft || !this.noteDraft.drawing || !["draw", "erase"].includes(this.noteDraft.mode)) return;
                const rect = canvas.getBoundingClientRect();
                const x = (event.clientX - rect.left) * canvas.width / rect.width;
                const y = (event.clientY - rect.top) * canvas.height / rect.height;
                context.lineWidth = Number(this.noteDraft.brushSize || 5) * canvas.width / Math.max(1, rect.width);
                context.strokeStyle = this.noteDraft.inkColor || "#ffffff";
                context.globalCompositeOperation = this.noteDraft.mode === "erase" ? "destination-out" : "source-over";
                context.lineTo(x, y);
                context.stroke();
            };
            const stopDrawing = () => {
                if (this.noteDraft) this.noteDraft.drawing = false;
                context.beginPath();
            };
            canvas.onpointerup = stopDrawing;
            canvas.onpointercancel = stopDrawing;
            canvas.onlostpointercapture = stopDrawing;
            this.setNoteTool(this.noteDraft.mode || "draw");
        },

        setNoteTool(mode) {
            if (!this.noteDraft) return;
            this.noteDraft.mode = ["text", "draw", "erase"].includes(mode) ? mode : "draw";
            const canvas = document.getElementById("notes-draw-canvas");
            const textLayer = document.getElementById("notes-text-box-layer");
            const stage = document.getElementById("notes-page-stage");
            const canDraw = ["draw", "erase"].includes(this.noteDraft.mode) && !this.noteDraft.loadingInk && !this.noteDraft.inkLoadFailed;
            if (canvas) {
                canvas.style.pointerEvents = canDraw ? "auto" : "none";
                canvas.style.cursor = this.noteDraft.mode === "erase" ? "cell" : "crosshair";
            }
            if (textLayer) {
                textLayer.style.pointerEvents = this.noteDraft.mode === "text" ? "auto" : "none";
                textLayer.querySelectorAll(".notes-text-box-editor").forEach(box => {
                    box.style.pointerEvents = this.noteDraft.mode === "text" ? "auto" : "none";
                });
            }
            if (stage) {
                stage.style.cursor = this.noteDraft.mode === "text" ? "text" : (this.noteDraft.mode === "erase" ? "cell" : "crosshair");
                stage.style.touchAction = canDraw ? "none" : "auto";
            }
            ["text", "draw", "erase"].forEach(tool => {
                const button = document.getElementById("note-tool-" + tool);
                if (!button) return;
                button.classList.toggle("is-active", this.noteDraft.mode === tool);
                button.setAttribute("aria-pressed", this.noteDraft.mode === tool ? "true" : "false");
            });
        },

        handleNoteStageClick(event) {
            if (!this.noteDraft || this.noteDraft.mode !== "text") return;
            if (event.target.closest(".notes-text-box-editor")) return;
            const stage = document.getElementById("notes-page-stage");
            if (!stage) return;
            const rect = stage.getBoundingClientRect();
            const x = Math.max(0, Math.min(62, ((event.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(0, Math.min(82, ((event.clientY - rect.top) / rect.height) * 100));
            const color = document.getElementById("note-ink-color")?.value || this.noteDraft.inkColor || "#ffffff";
            const fontScale = Number(document.getElementById("note-text-scale")?.value || 2.5);
            const box = {
                id: generateId(), x, y, width: 36, height: 16, text: "",
                color: validColor(color) ? color : "#ffffff", fontScale
            };
            this.noteDraft.textBoxes.push(box);
            this.noteDraft.selectedTextBoxId = box.id;
            this.refreshNoteTextBoxes(box.id);
            event.stopPropagation();
        },

        refreshNoteTextBoxes(focusId = null) {
            const layer = document.getElementById("notes-text-box-layer");
            if (!layer || !this.noteDraft) return;
            layer.innerHTML = this.renderNoteTextBoxes({ textBoxes: this.noteDraft.textBoxes || [] }, true);
            this.setNoteTool(this.noteDraft.mode || "draw");
            if (focusId) layer.querySelector('[data-text-box-id="' + focusId + '"] textarea')?.focus({ preventScroll: true });
        },

        selectNoteTextBox(boxId) {
            if (!this.noteDraft) return;
            const box = this.noteDraft.textBoxes.find(item => item.id === boxId);
            if (!box) return;
            this.noteDraft.selectedTextBoxId = boxId;
            const color = document.getElementById("note-ink-color");
            const size = document.getElementById("note-text-scale");
            if (color) color.value = validColor(box.color) ? box.color : "#ffffff";
            if (size) size.value = String(box.fontScale || 2.5);
            document.querySelectorAll(".notes-text-box-editor").forEach(element => {
                element.classList.toggle("is-selected", element.dataset.textBoxId === boxId);
            });
        },

        updateNoteTextBox(boxId, value) {
            if (!this.noteDraft) return;
            const box = this.noteDraft.textBoxes.find(item => item.id === boxId);
            if (box) box.text = String(value ?? "");
        },

        setNoteTextScale(value) {
            if (!this.noteDraft) return;
            const scale = Math.min(8, Math.max(1, Number(value) || 2.5));
            const id = this.noteDraft.selectedTextBoxId;
            const box = this.noteDraft.textBoxes.find(item => item.id === id);
            if (!box) return;
            box.fontScale = scale;
            const element = document.querySelector('[data-text-box-id="' + id + '"]');
            if (element) element.style.setProperty("--notes-text-scale", scale);
        },

        deleteNoteTextBox(boxId) {
            if (!this.noteDraft) return;
            this.noteDraft.textBoxes = this.noteDraft.textBoxes.filter(item => item.id !== boxId);
            if (this.noteDraft.selectedTextBoxId === boxId) this.noteDraft.selectedTextBoxId = null;
            this.refreshNoteTextBoxes();
        },

        updateNoteInkColor(color) {
            if (!validColor(color) || !this.noteDraft) return;
            this.noteDraft.inkColor = color;
            const box = this.noteDraft.textBoxes.find(item => item.id === this.noteDraft.selectedTextBoxId);
            if (box) {
                box.color = color;
                const element = document.querySelector('[data-text-box-id="' + box.id + '"]');
                if (element) element.style.color = color;
            }
        },

        startMoveNoteTextBox(event, boxId) {
            if (!this.noteDraft || this.noteDraft.mode !== "text") return;
            event.preventDefault();
            event.stopPropagation();
            const box = this.noteDraft.textBoxes.find(item => item.id === boxId);
            const stage = document.getElementById("notes-page-stage");
            const element = document.querySelector('[data-text-box-id="' + boxId + '"]');
            if (!box || !stage || !element) return;
            this.selectNoteTextBox(boxId);
            const rect = stage.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const originalX = Number(box.x) || 0;
            const originalY = Number(box.y) || 0;
            const move = moveEvent => {
                const dx = (moveEvent.clientX - startX) / rect.width * 100;
                const dy = (moveEvent.clientY - startY) / rect.height * 100;
                box.x = Math.max(0, Math.min(100 - box.width, originalX + dx));
                box.y = Math.max(0, Math.min(100 - box.height, originalY + dy));
                element.style.left = box.x + "%";
                element.style.top = box.y + "%";
            };
            const stop = () => {
                document.removeEventListener("pointermove", move);
                document.removeEventListener("pointerup", stop);
                document.removeEventListener("pointercancel", stop);
                this.noteTextMoveCleanup = null;
            };
            if (this.noteTextMoveCleanup) this.noteTextMoveCleanup();
            this.noteTextMoveCleanup = stop;
            document.addEventListener("pointermove", move);
            document.addEventListener("pointerup", stop);
            document.addEventListener("pointercancel", stop);
        },

        setNoteBrushSize(value) {
            if (this.noteDraft) this.noteDraft.brushSize = Math.min(28, Math.max(2, Number(value) || 5));
        },

        clearNoteStrokes() {
            const canvas = document.getElementById("notes-draw-canvas");
            if (!canvas || !confirm("Clear all pen strokes on this page? Typed text will stay.")) return;
            canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
            // Upload the cleared transparent layer at confirmation to replace any saved strokes.
            if (this.noteDraft) this.noteDraft.inkChanged = true;
        },

        getCurrentNotePage() {
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return null;
            return stData.subtopic.notes.find(page => page.id === this.currentNotePageId) || null;
        },

        syncNoteBackgroundControls(scope) {
            const stData = this.findSubtopic(activeSubtopicId);
            const page = this.getCurrentNotePage();
            if (!stData || !page) return;
            const config = this.getNoteBackgroundForScope(scope, stData, page);
            const colorControl = document.getElementById("notes-bg-color");
            if (colorControl && config.type === "color") colorControl.value = config.value;
        },

        storeNoteBackground(scope, config, stData, page) {
            const normalized = normalizeBackground(config);
            if (!normalized) return this.showToast("Choose a valid page background.", "error");
            if (!data.noteBackgrounds || typeof data.noteBackgrounds !== "object") data.noteBackgrounds = {};
            data.noteBackgrounds.global = normalizeBackground(data.noteBackgrounds.global) || { type: "color", value: "#000000" };
            data.noteBackgrounds.subjects = data.noteBackgrounds.subjects || {};
            data.noteBackgrounds.topics = data.noteBackgrounds.topics || {};
            data.noteBackgrounds.subtopics = data.noteBackgrounds.subtopics || {};
            if (scope === "page") {
                page.background = normalized;
            } else if (scope === "subtopic") {
                data.noteBackgrounds.subtopics[stData.subtopic.id] = normalized;
            } else if (scope === "topic") {
                data.noteBackgrounds.topics[stData.topic.id] = normalized;
            } else if (scope === "subject") {
                data.noteBackgrounds.subjects[stData.subject.id] = normalized;
            } else {
                data.noteBackgrounds.global = normalized;
            }
            this.save();
            this.updateNoteStageBackground();
            this.showToast("Background setting applied.", "success");
        },

        applyNoteColorBackground() {
            const stData = this.findSubtopic(activeSubtopicId);
            const page = this.getCurrentNotePage();
            const scope = document.getElementById("notes-bg-scope")?.value || "subtopic";
            const value = document.getElementById("notes-bg-color")?.value || "#000000";
            if (!stData || !page || !validColor(value)) return;
            this.storeNoteBackground(scope, { type: "color", value: value }, stData, page);
        },

        async uploadNoteBackgroundFile(event) {
            const file = event.target && event.target.files && event.target.files[0];
            event.target.value = "";
            if (!file) return;
            const stData = this.findSubtopic(activeSubtopicId);
            const page = this.getCurrentNotePage();
            if (!stData || !page) return;
            const scope = document.getElementById("notes-bg-scope")?.value || "subtopic";
            const status = document.getElementById("notes-save-status");
            if (status) status.textContent = "Uploading custom background to ImgBB…";
            try {
                const url = await this.uploadNoteImage(file);
                this.storeNoteBackground(scope, { type: "image", value: url }, stData, page);
                if (status) status.textContent = "Background uploaded and applied.";
            } catch (error) {
                this.showToast("Background upload failed: " + error.message, "error");
                if (status) status.textContent = "Background upload failed.";
            }
        },

        updateNoteStageBackground() {
            const stData = this.findSubtopic(activeSubtopicId);
            const page = this.getCurrentNotePage();
            const background = document.getElementById("notes-page-background");
            if (!stData || !page || !background) return;
            background.style.backgroundColor = "#000000";
            background.style.backgroundImage = "none";
            const config = this.getNoteBackground(stData, page);
            if (config.type === "image") {
                background.style.backgroundImage = "url('" + config.value.replace(/'/g, "%27") + "')";
                background.style.backgroundSize = "cover";
                background.style.backgroundPosition = "center";
            } else {
                background.style.backgroundColor = config.value;
            }
        },

        resizeCurrentNotePage(preset) {
            const canvas = document.getElementById("notes-draw-canvas");
            if (!canvas) return;
            const dimensions = PAGE_SIZES[preset] || getStoredSize();
            const nextWidth = preset === "Custom" ? getStoredSize().width : dimensions.width;
            const nextHeight = preset === "Custom" ? getStoredSize().height : dimensions.height;
            const oldCanvas = document.createElement("canvas");
            oldCanvas.width = canvas.width;
            oldCanvas.height = canvas.height;
            oldCanvas.getContext("2d").drawImage(canvas, 0, 0);
            canvas.width = nextWidth;
            canvas.height = nextHeight;
            canvas.getContext("2d").drawImage(oldCanvas, 0, 0, nextWidth, nextHeight);
            const stage = document.getElementById("notes-page-stage");
            if (stage) stage.style.aspectRatio = nextWidth + " / " + nextHeight;
            if (this.noteDraft) {
                this.noteDraft.width = nextWidth;
                this.noteDraft.height = nextHeight;
                this.noteDraft.inkChanged = true;
            }
            data.noteSettings.pageSize = { preset: preset, width: nextWidth, height: nextHeight };
            this.save();
            this.showToast("Page size updated. Confirm the page to save the resized image.", "info");
        },

        async uploadNoteImage(file) {
            if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Choose a valid image file.");
            if (file.size > 10 * 1024 * 1024) throw new Error("Images must be 10 MB or smaller.");
            const formData = new FormData();
            formData.append("image", file, file.name || "notes-page.png");
            const response = await fetch("https://api.imgbb.com/1/upload?key=" + IMGBB_API_KEY, { method: "POST", body: formData });
            const result = await response.json();
            if (!response.ok || !result.success || !result.data || !result.data.url) {
                throw new Error(result.error && result.error.message ? result.error.message : "ImgBB rejected the upload.");
            }
            const safe = this.safeImageURL(result.data.url);
            if (!safe) throw new Error("ImgBB returned an invalid image URL.");
            return new URL(result.data.url).href;
        },

        async uploadNotePageFile(event) {
            const file = event.target && event.target.files && event.target.files[0];
            event.target.value = "";
            if (!file) return;
            const stData = this.findSubtopic(activeSubtopicId);
            if (!stData) return;
            const status = this.showToast("Uploading image page to ImgBB…", "info");
            try {
                const url = await this.uploadNoteImage(file);
                const size = getStoredSize();
                stData.subtopic.notes.push({
                    id: generateId(),
                    title: "Page " + (stData.subtopic.notes.length + 1),
                    type: "image",
                    text: "",
                    textColor: "#ffffff",
                    imageUrl: url,
                    imagePageUrl: url,
                    foregroundUrl: "",
                    width: size.width,
                    height: size.height,
                    background: null,
                    createdAt: Date.now()
                });
                await this.save();
                this.setView("notes-manager", true);
                this.showToast("Image page uploaded and saved.", "success");
            } catch (error) {
                console.error(error);
                this.showToast("Image page upload failed: " + error.message, "error");
            }
        },

        async saveNotePage() {
            const stData = this.findSubtopic(activeSubtopicId);
            const page = this.getCurrentNotePage();
            const canvas = document.getElementById("notes-draw-canvas");
            const status = document.getElementById("notes-save-status");
            if (!stData || !page || !canvas) return;
            if (this.noteDraft?.loadingInk) return this.showToast("Wait for the saved drawing to finish loading.", "error");
            if (this.noteDraft?.inkLoadFailed) return this.showToast("The old drawing has not loaded; reopen the page before saving to avoid losing it.", "error");
            if (this.imageUploadInProgress) return this.showToast("Wait for the current image upload to finish.", "error");

            const width = canvas.width;
            const height = canvas.height;
            const textBoxes = structuredClone(this.noteDraft?.textBoxes || []);
            const foreground = document.createElement("canvas");
            foreground.width = width;
            foreground.height = height;
            foreground.getContext("2d").drawImage(canvas, 0, 0, width, height);
            const resolvedBackground = this.getNoteBackground(stData, page);
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = width;
            finalCanvas.height = height;
            const finalContext = finalCanvas.getContext("2d");
            if (status) status.textContent = "Composing page…";

            try {
                if (resolvedBackground.type === "image") {
                    const backgroundImage = await loadImage(resolvedBackground.value);
                    drawCover(finalContext, backgroundImage, width, height);
                } else {
                    finalContext.fillStyle = resolvedBackground.value;
                    finalContext.fillRect(0, 0, width, height);
                }

                if (page.imagePageUrl) {
                    const pageImage = await loadImage(page.imagePageUrl);
                    drawContain(finalContext, pageImage, width, height);
                }
                finalContext.drawImage(foreground, 0, 0);
                textBoxes.forEach(box => {
                    if (String(box.text || "").trim()) {
                        drawWrappedText(finalContext, box.text, box.color, width, height, box);
                    }
                });

                if (status) status.textContent = "Uploading the latest page image to ImgBB…";
                let foregroundUrl = page.foregroundUrl || "";
                if (this.noteDraft && this.noteDraft.inkChanged) {
                    foregroundUrl = await this.uploadNoteImage(await canvasToBlob(foreground));
                }
                const flattenedUrl = await this.uploadNoteImage(await canvasToBlob(finalCanvas));

                page.text = "";
                page.textBoxes = textBoxes;
                page.width = width;
                page.height = height;
                page.foregroundUrl = foregroundUrl;
                page.imageUrl = flattenedUrl;
                page.type = page.imagePageUrl ? "image" : "canvas";
                const saved = await this.save();
                if (!saved) throw new Error("The image uploaded, but local page data could not be saved. Please retry.");
                this.returnToNotesManager();
                this.showToast("Page saved. Latest drawing and page images are stored on ImgBB.", "success");
            } catch (error) {
                console.error(error);
                if (status) status.textContent = "Save failed. Your drawing and text remain in this editor.";
                this.showToast("Could not save notes page: " + error.message, "error");
            }
        }
    });
})();