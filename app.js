(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const toolbar = document.getElementById("toolbar");
  const fileNameEl = document.getElementById("fileName");
  const downloadBtn = document.getElementById("downloadPdfBtn");
  const resetBtn = document.getElementById("resetBtn");
  const statusEl = document.getElementById("status");
  const previewEl = document.getElementById("preview");
  const notebookRoot = document.getElementById("notebookRoot");

  let currentBaseName = "notebook";

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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

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

  function stripAnsi(str) {
    return str.replace(/\[[0-9;]*m/g, "");
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

  function renderNotebook(notebook, title) {
    notebookRoot.innerHTML = "";

    const titleEl = document.createElement("div");
    titleEl.className = "nb-title";
    titleEl.textContent = title;
    notebookRoot.appendChild(titleEl);

    const language = detectLanguage(notebook);
    const cells = notebook.cells || [];

    cells.forEach((cell) => {
      let el;
      if (cell.cell_type === "code") {
        el = renderCodeCell(cell, language);
      } else if (cell.cell_type === "markdown") {
        el = renderMarkdownCell(cell);
      } else {
        el = renderRawCell(cell);
      }
      notebookRoot.appendChild(el);
    });
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.classList.remove("hidden");
  }

  function hideStatus() {
    statusEl.classList.add("hidden");
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".ipynb")) {
      showStatus("Please choose a valid .ipynb file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      let notebook;
      try {
        notebook = JSON.parse(reader.result);
      } catch (e) {
        showStatus("This file isn't valid JSON — is it really a .ipynb notebook?", "error");
        return;
      }

      if (!notebook || !Array.isArray(notebook.cells)) {
        showStatus("This doesn't look like a Jupyter notebook (no cells found).", "error");
        return;
      }

      currentBaseName = file.name.replace(/\.ipynb$/i, "");
      fileNameEl.textContent = file.name;

      try {
        renderNotebook(notebook, currentBaseName);
      } catch (e) {
        console.error(e);
        showStatus("Something went wrong rendering this notebook: " + e.message, "error");
        return;
      }

      hideStatus();
      toolbar.classList.remove("hidden");
      previewEl.classList.remove("hidden");
      dropzone.classList.add("hidden");
    };
    reader.onerror = () => showStatus("Could not read that file.", "error");
    reader.readAsText(file);
  }

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

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
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  resetBtn.addEventListener("click", () => {
    toolbar.classList.add("hidden");
    previewEl.classList.add("hidden");
    dropzone.classList.remove("hidden");
    notebookRoot.innerHTML = "";
    fileInput.value = "";
    hideStatus();
  });

  downloadBtn.addEventListener("click", () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Generating PDF…";
    showStatus("Rendering PDF — this can take a few seconds for long notebooks…", "info");

    const opt = {
      margin: [10, 10],
      filename: `${currentBaseName}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    html2pdf()
      .set(opt)
      .from(notebookRoot)
      .save()
      .then(() => {
        hideStatus();
      })
      .catch((err) => {
        console.error(err);
        showStatus("PDF generation failed: " + err.message, "error");
      })
      .finally(() => {
        downloadBtn.disabled = false;
        downloadBtn.textContent = "Download PDF";
      });
  });
})();
