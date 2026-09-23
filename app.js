(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const toolbar = document.getElementById("toolbar");
  const fileCountEl = document.getElementById("fileCount");
  const fileListEl = document.getElementById("fileList");
  const downloadBtn = document.getElementById("downloadPdfBtn");
  const addMoreBtn = document.getElementById("addMoreBtn");
  const resetBtn = document.getElementById("resetBtn");
  const statusEl = document.getElementById("status");
  const previewEl = document.getElementById("preview");
  const notebookRoot = document.getElementById("notebookRoot");

  // Each entry: { id, fileName, baseName, notebook }
  let loadedFiles = [];
  let nextId = 1;

  marked.setOptions({
    breaks: true,
    highlight: function (code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {
          /* fall through */
        }
      }
      return hljs.highlightAuto(code).value;
    },
  });

  function joinSource(source) {
    if (Array.isArray(source)) return source.join("");
    return source || "";
  }

  function detectLanguage(notebook) {
    const meta = notebook.metadata || {};
    return (
      (meta.language_info && meta.language_info.name) ||
      (meta.kernelspec && meta.kernelspec.language) ||
      "python"
    );
  }

  function stripAnsi(str) {
    return str.replace(/\[[0-9;]*m/g, "");
  }

  function renderOutput(output) {
    const wrap = document.createElement("div");
    wrap.className = "nb-output";

    if (output.output_type === "stream") {
      const pre = document.createElement("pre");
      pre.textContent = joinSource(output.text);
      wrap.appendChild(pre);
      return wrap;
    }

    if (output.output_type === "error") {
      wrap.classList.add("nb-output-error");
      const pre = document.createElement("pre");
      const traceback = output.traceback || [];
      pre.textContent = traceback.length
        ? stripAnsi(traceback.join("\n"))
        : `${output.ename}: ${output.evalue}`;
      wrap.appendChild(pre);
      return wrap;
    }

    if (output.output_type === "execute_result" || output.output_type === "display_data") {
      const data = output.data || {};
      if (data["image/png"]) {
        const img = document.createElement("img");
        img.src = "data:image/png;base64," + data["image/png"].replace(/\n/g, "");
        wrap.appendChild(img);
        return wrap;
      }
      if (data["image/jpeg"]) {
        const img = document.createElement("img");
        img.src = "data:image/jpeg;base64," + data["image/jpeg"].replace(/\n/g, "");
        wrap.appendChild(img);
        return wrap;
      }
      if (data["image/svg+xml"]) {
        wrap.innerHTML = joinSource(data["image/svg+xml"]);
        return wrap;
      }
      if (data["text/html"]) {
        wrap.innerHTML = joinSource(data["text/html"]);
        return wrap;
      }
      if (data["text/plain"]) {
        const pre = document.createElement("pre");
        pre.textContent = joinSource(data["text/plain"]);
        wrap.appendChild(pre);
        return wrap;
      }
    }

    return null;
  }

  function renderCodeCell(cell, language) {
    const container = document.createElement("div");
    container.className = "nb-cell nb-cell-code";

    const prompt = document.createElement("div");
    prompt.className = "nb-prompt";
    const num = cell.execution_count != null ? cell.execution_count : " ";
    prompt.textContent = `In [${num}]:`;

    const right = document.createElement("div");

    const codeBlock = document.createElement("div");
    codeBlock.className = "nb-code-block";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = `language-${language}`;
    const src = joinSource(cell.source);
    try {
      code.innerHTML = hljs.highlight(src, { language: hljs.getLanguage(language) ? language : "python" }).value;
    } catch (e) {
      code.textContent = src;
    }
    pre.appendChild(code);
    codeBlock.appendChild(pre);
    right.appendChild(codeBlock);

    (cell.outputs || []).forEach((output) => {
      const rendered = renderOutput(output);
      if (rendered) right.appendChild(rendered);
    });

    container.appendChild(prompt);
    container.appendChild(right);
    return container;
  }

  function renderMarkdownCell(cell) {
    const container = document.createElement("div");
    container.className = "nb-cell nb-markdown";
    const src = joinSource(cell.source);
    container.innerHTML = marked.parse(src);
    return container;
  }

  function renderRawCell(cell) {
    const container = document.createElement("div");
    container.className = "nb-cell";
    const pre = document.createElement("pre");
    pre.textContent = joinSource(cell.source);
    container.appendChild(pre);
    return container;
  }

  function buildNotebookElement(entry) {
    const doc = document.createElement("div");
    doc.className = "nb-doc";
    doc.dataset.fileId = entry.id;

    const titleEl = document.createElement("div");
    titleEl.className = "nb-title";
    titleEl.textContent = entry.baseName;
    doc.appendChild(titleEl);

    const language = detectLanguage(entry.notebook);
    const cells = entry.notebook.cells || [];

    cells.forEach((cell) => {
      let el;
      if (cell.cell_type === "code") {
        el = renderCodeCell(cell, language);
      } else if (cell.cell_type === "markdown") {
        el = renderMarkdownCell(cell);
      } else {
        el = renderRawCell(cell);
      }
      doc.appendChild(el);
    });

    return doc;
  }

  function renderAll() {
    notebookRoot.innerHTML = "";
    loadedFiles.forEach((entry) => {
      notebookRoot.appendChild(buildNotebookElement(entry));
    });
  }

  function renderFileList() {
    fileListEl.innerHTML = "";
    loadedFiles.forEach((entry) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "file-list-name";
      name.textContent = entry.fileName;
      const removeBtn = document.createElement("button");
      removeBtn.className = "file-remove";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", `Remove ${entry.fileName}`);
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => removeFile(entry.id));
      li.appendChild(name);
      li.appendChild(removeBtn);
      fileListEl.appendChild(li);
    });
  }

  function updateUiForFiles() {
    const hasFiles = loadedFiles.length > 0;
    toolbar.classList.toggle("hidden", !hasFiles);
    fileListEl.classList.toggle("hidden", !hasFiles);
    previewEl.classList.toggle("hidden", !hasFiles);
    dropzone.classList.toggle("hidden", hasFiles);
    fileCountEl.textContent = hasFiles
      ? `${loadedFiles.length} notebook${loadedFiles.length === 1 ? "" : "s"} loaded`
      : "";
    renderFileList();
    renderAll();
  }

  function removeFile(id) {
    loadedFiles = loadedFiles.filter((entry) => entry.id !== id);
    updateUiForFiles();
    if (loadedFiles.length === 0) hideStatus();
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove("hidden");
  }

  function hideStatus() {
    statusEl.classList.add("hidden");
  }

  function uniqueBaseName(name) {
    let candidate = name;
    let n = 2;
    const existing = new Set(loadedFiles.map((e) => e.baseName));
    while (existing.has(candidate)) {
      candidate = `${name} (${n})`;
      n += 1;
    }
    return candidate;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read file"));
      reader.readAsText(file);
    });
  }

  async function handleFiles(fileListLike) {
    const files = Array.from(fileListLike || []).filter((f) =>
      f.name.toLowerCase().endsWith(".ipynb")
    );

    if (files.length === 0) {
      showStatus("Please choose one or more valid .ipynb files.", "error");
      return;
    }

    const errors = [];

    for (const file of files) {
      let text;
      try {
        text = await readFileAsText(file);
      } catch (e) {
        errors.push(`${file.name}: could not be read`);
        continue;
      }

      let notebook;
      try {
        notebook = JSON.parse(text);
      } catch (e) {
        errors.push(`${file.name}: not valid JSON`);
        continue;
      }

      if (!notebook || !Array.isArray(notebook.cells)) {
        errors.push(`${file.name}: doesn't look like a notebook (no cells)`);
        continue;
      }

      const baseName = uniqueBaseName(file.name.replace(/\.ipynb$/i, ""));
      loadedFiles.push({
        id: nextId++,
        fileName: file.name,
        baseName,
        notebook,
      });
    }

    updateUiForFiles();

    if (errors.length) {
      showStatus(`Skipped ${errors.length} file(s): ${errors.join("; ")}`, "error");
    } else {
      hideStatus();
    }
  }

  dropzone.addEventListener("click", () => fileInput.click());
  addMoreBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    handleFiles(e.target.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    handleFiles(e.dataTransfer.files);
  });

  resetBtn.addEventListener("click", () => {
    loadedFiles = [];
    updateUiForFiles();
    fileInput.value = "";
    hideStatus();
  });

  function sanitizeZipEntryName(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_");
  }

  downloadBtn.addEventListener("click", async () => {
    if (loadedFiles.length === 0) return;

    downloadBtn.disabled = true;
    addMoreBtn.disabled = true;
    resetBtn.disabled = true;
    const originalLabel = downloadBtn.textContent;

    const opt = {
      margin: [10, 10],
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    try {
      const total = loadedFiles.length;

      if (total === 1) {
        const entry = loadedFiles[0];
        showStatus(`Rendering PDF for ${entry.fileName}…`, "info");
        downloadBtn.textContent = "Generating PDF…";
        const el = notebookRoot.querySelector(`[data-file-id="${entry.id}"]`);
        await html2pdf().set({ ...opt, filename: `${entry.baseName}.pdf` }).from(el).save();
        hideStatus();
        return;
      }

      const zip = new JSZip();

      for (let i = 0; i < total; i++) {
        const entry = loadedFiles[i];
        downloadBtn.textContent = `Converting ${i + 1} of ${total}…`;
        showStatus(`Converting ${i + 1} of ${total}: ${entry.fileName}`, "info");

        const el = notebookRoot.querySelector(`[data-file-id="${entry.id}"]`);
        const pdfBlob = await html2pdf().set(opt).from(el).outputPdf("blob");
        zip.file(`${sanitizeZipEntryName(entry.baseName)}.pdf`, pdfBlob);
      }

      showStatus("Packaging PDFs into a ZIP…", "info");
      downloadBtn.textContent = "Packaging ZIP…";

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "notebooks-pdf.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      hideStatus();
    } catch (err) {
      console.error(err);
      showStatus("PDF conversion failed: " + err.message, "error");
    } finally {
      downloadBtn.disabled = false;
      addMoreBtn.disabled = false;
      resetBtn.disabled = false;
      downloadBtn.textContent = originalLabel;
    }
  });
})();
