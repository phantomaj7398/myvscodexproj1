(function () {
  "use strict";

  const STORAGE_KEY = "proposal-manager:proposals:v1";
  const DRAFT_KEY = "proposal-manager:draft:v1";
  const THEME_KEY = "proposal-manager:theme:v1";
  const STATUSES = ["Pending", "Completed", "For information only"];
  const STATUS_MIGRATION = {
    Draft: "Pending",
    Final: "Completed",
    Sent: "For information only"
  };

  const app = document.getElementById("app");
  const backupButton = document.getElementById("backupButton");
  const importInput = document.getElementById("importInput");
  const themeToggle = document.getElementById("themeToggle");

  let proposals = loadProposals();

  function uid() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "proposal-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function todayISO() {
    return new Date().toISOString();
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeStatus(status) {
    const migrated = STATUS_MIGRATION[status] || status;
    return STATUSES.includes(migrated) ? migrated : "Pending";
  }

  function statusClass(status) {
    return normalizeStatus(status).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function normalizeProposal(proposal) {
    const now = todayISO();
    const divisions = Array.isArray(proposal.divisions) ? proposal.divisions : [];
    const image = proposal.image && proposal.image.dataUrl
      ? {
          name: String(proposal.image.name || "Uploaded image"),
          type: String(proposal.image.type || "image/*"),
          dataUrl: String(proposal.image.dataUrl)
        }
      : null;
    const legacyTimeline = String(proposal.timeline || "").trim();
    const inferredDate = /^\d{4}-\d{2}-\d{2}$/.test(legacyTimeline) ? legacyTimeline : "";
    const timelineType = proposal.timelineType === "date" || inferredDate ? "date" : "none";

    return {
      id: proposal.id || uid(),
      title: String(proposal.title || "").trim(),
      description: String(proposal.description || "").trim(),
      timelineType,
      timelineDate: timelineType === "date" ? String(proposal.timelineDate || inferredDate).trim() : "",
      notes: String(proposal.notes || "").trim(),
      divisions: divisions.map((row) => ({
        division: String(row.division || row.divisions || "").trim(),
        comments: String(row.comments || "").trim(),
        additionalComments: String(row.additionalComments || "").trim()
      })),
      image,
      status: normalizeStatus(proposal.status),
      createdAt: proposal.createdAt || now,
      updatedAt: proposal.updatedAt || now
    };
  }

  function loadProposals() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(stored)) return [];
      return stored.map(normalizeProposal);
    } catch (error) {
      console.warn("Unable to load proposals", error);
      return [];
    }
  }

  function saveProposals() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals));
  }

  function getProposal(id) {
    return proposals.find((proposal) => proposal.id === id);
  }

  function setTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(saved || (prefersDark ? "dark" : "light"));
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function currentRoute() {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    const parts = hash.split("/").filter(Boolean);
    if (parts.length === 0) return { page: "dashboard" };
    if (parts[0] === "new") return { page: "form", id: null };
    if (parts[0] === "edit" && parts[1]) return { page: "form", id: parts[1] };
    if (parts[0] === "proposal" && parts[1]) return { page: "detail", id: parts[1] };
    return { page: "not-found" };
  }

  function render() {
    document.title = "Proposal Manager";
    const route = currentRoute();
    if (route.page === "dashboard") renderDashboard();
    if (route.page === "form") renderForm(route.id);
    if (route.page === "detail") renderDetail(route.id);
    if (route.page === "not-found") renderNotFound();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderDashboard() {
    app.innerHTML = "";
    app.append(document.getElementById("dashboardTemplate").content.cloneNode(true));

    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const sortSelect = document.getElementById("sortSelect");
    const proposalList = document.getElementById("proposalList");
    const emptyState = document.getElementById("emptyState");
    const resultCount = document.getElementById("resultCount");

    function drawList() {
      const query = searchInput.value.trim().toLowerCase();
      const status = statusFilter.value;
      const sort = sortSelect.value;

      let visible = proposals.filter((proposal) => {
        const searchable = [
          proposal.title,
          proposal.description,
          proposal.timelineDate,
          proposal.notes,
          ...proposal.divisions.flatMap((row) => [
            row.division,
            row.comments,
            row.additionalComments
          ])
        ].join(" ").toLowerCase();
        return (!query || searchable.includes(query)) && (status === "All" || proposal.status === status);
      });

      visible = visible.sort((a, b) => {
        if (sort === "date-asc") return new Date(a.updatedAt) - new Date(b.updatedAt);
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "title-desc") return b.title.localeCompare(a.title);
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });

      proposalList.innerHTML = "";
      resultCount.textContent = visible.length + (visible.length === 1 ? " shown" : " shown");
      emptyState.hidden = visible.length > 0;

      visible.forEach((proposal) => {
        const card = document.createElement("a");
        card.className = "proposal-card";
        card.href = "#/proposal/" + encodeURIComponent(proposal.id);
        card.innerHTML = `
          <div class="card-title-row">
            <h3>${escapeHtml(proposal.title || "Untitled Proposal")}</h3>
            <span class="status-badge ${statusClass(proposal.status)}">${escapeHtml(proposal.status)}</span>
          </div>
          <div class="proposal-meta">
            <span>Updated ${formatDate(proposal.updatedAt)}</span>
            <span>${escapeHtml(getTimelineLabel(proposal))}</span>
          </div>
          <div class="card-footer">
            <strong>View</strong>
          </div>
        `;
        proposalList.append(card);
      });
    }

    searchInput.addEventListener("input", drawList);
    statusFilter.addEventListener("change", drawList);
    sortSelect.addEventListener("change", drawList);
    drawList();
  }

  function renderForm(id) {
    const existing = id ? getProposal(id) : null;
    if (id && !existing) {
      renderNotFound();
      return;
    }

    app.innerHTML = "";
    app.append(document.getElementById("formTemplate").content.cloneNode(true));

    const form = document.getElementById("proposalForm");
    const autosaveState = document.getElementById("autosaveState");
    const deleteButton = document.getElementById("deleteFromForm");
    const ocrUpload = document.getElementById("ocrUpload");
    const timelineDateField = document.getElementById("timelineDateField");
    const divisionRows = document.getElementById("divisionRows");
    const addDivisionRow = document.getElementById("addDivisionRow");
    const removeImageButton = document.getElementById("removeImageButton");
    const draft = !existing ? loadDraft() : null;
    const data = existing || draft || {};
    let currentImage = data.image || null;

    document.getElementById("formMode").textContent = existing ? "Edit proposal" : "New proposal";
    document.getElementById("formTitle").textContent = existing ? "Edit Proposal" : "Create Proposal";
    deleteButton.hidden = !existing;

    form.elements.title.value = data.title || "";
    form.elements.description.value = data.description || "";
    form.elements.timelineType.value = data.timelineType || "none";
    form.elements.timelineDate.value = data.timelineDate || "";
    form.elements.notes.value = data.notes || "";
    form.elements.status.value = data.status || "Pending";
    syncTimelineDateVisibility(form, timelineDateField);
    renderDivisionRows(divisionRows, data.divisions && data.divisions.length ? data.divisions : [emptyDivisionRow()]);
    updateImagePreview(currentImage);

    let autosaveTimer;
    form.addEventListener("input", () => {
      clearTimeout(autosaveTimer);
      autosaveState.textContent = "Saving...";
      autosaveTimer = setTimeout(() => {
        const formData = readForm(form, currentImage);
        if (existing) {
          Object.assign(existing, formData, { updatedAt: todayISO() });
          saveProposals();
        } else {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
        }
        autosaveState.textContent = "Autosaved";
      }, 350);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = readForm(form, currentImage);
      if (!formData.title) {
        alert("Please add a proposal title.");
        return;
      }
      if (formData.timelineType === "date" && !formData.timelineDate) {
        alert("Please choose a timeline date or select no fixed date.");
        return;
      }

      if (existing) {
        Object.assign(existing, formData, { updatedAt: todayISO() });
      } else {
        const now = todayISO();
        proposals.unshift(normalizeProposal({
          ...formData,
          id: uid(),
          createdAt: now,
          updatedAt: now
        }));
        localStorage.removeItem(DRAFT_KEY);
      }

      saveProposals();
      navigate("#/proposal/" + encodeURIComponent((existing || proposals[0]).id));
    });

    deleteButton.addEventListener("click", () => {
      if (existing && confirm("Delete this proposal permanently?")) {
        proposals = proposals.filter((proposal) => proposal.id !== existing.id);
        saveProposals();
        navigate("#/");
      }
    });

    form.elements.timelineType.addEventListener("change", () => {
      syncTimelineDateVisibility(form, timelineDateField);
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });

    addDivisionRow.addEventListener("click", () => {
      appendDivisionRow(divisionRows, emptyDivisionRow());
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });

    divisionRows.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-remove-row]");
      if (!removeButton) return;
      removeButton.closest("tr").remove();
      if (!divisionRows.children.length) {
        appendDivisionRow(divisionRows, emptyDivisionRow());
      }
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });

    removeImageButton.addEventListener("click", () => {
      currentImage = null;
      updateImagePreview(currentImage);
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });

    ocrUpload.addEventListener("change", async () => {
      const file = ocrUpload.files && ocrUpload.files[0];
      if (!file) return;

      try {
        currentImage = await createStoredImage(file);
        updateImagePreview(currentImage);
        form.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (error) {
        alert("Could not save that image. Please try a different file.");
        ocrUpload.value = "";
        return;
      }

      if (!window.Tesseract || !window.Tesseract.recognize) {
        const missingScriptNote = "\n\n[OCR unavailable: Tesseract.js could not be loaded. Check your internet connection, then try again.]";
        form.elements.description.value = (form.elements.description.value || "") + missingScriptNote;
        form.dispatchEvent(new Event("input", { bubbles: true }));
        ocrUpload.value = "";
        return;
      }

      ocrUpload.disabled = true;
      autosaveState.textContent = "OCR starting...";

      try {
        const result = await window.Tesseract.recognize(file, "eng", {
          logger: (progress) => {
            if (progress.status === "recognizing text") {
              const percent = Math.round((progress.progress || 0) * 100);
              autosaveState.textContent = "OCR " + percent + "%";
            } else if (progress.status) {
              autosaveState.textContent = progress.status;
            }
          }
        });
        const extracted = (result.data && result.data.text ? result.data.text : "").trim();
        const note = extracted
          ? "\n\n[OCR from " + file.name + "]\n" + extracted
          : "\n\n[OCR from " + file.name + ": no readable text found.]";
        form.elements.description.value = (form.elements.description.value || "") + note;
        form.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (error) {
        const failureNote = "\n\n[OCR from " + file.name + " failed. Try a clearer image or check your connection.]";
        form.elements.description.value = (form.elements.description.value || "") + failureNote;
        form.dispatchEvent(new Event("input", { bubbles: true }));
      } finally {
        ocrUpload.disabled = false;
        ocrUpload.value = "";
        if (autosaveState.textContent.startsWith("OCR") || autosaveState.textContent.includes("loading")) {
          autosaveState.textContent = "OCR complete";
        }
      }
    });
  }

  function emptyDivisionRow() {
    return {
      division: "",
      comments: "",
      additionalComments: ""
    };
  }

  function renderDivisionRows(container, rows) {
    container.innerHTML = "";
    rows.forEach((row) => appendDivisionRow(container, row));
  }

  function appendDivisionRow(container, row) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><textarea data-division-field="division" rows="2" placeholder="Division">${escapeHtml(row.division)}</textarea></td>
      <td><textarea data-division-field="comments" rows="2" placeholder="Comments">${escapeHtml(row.comments)}</textarea></td>
      <td><textarea data-division-field="additionalComments" rows="2" placeholder="Additional comments">${escapeHtml(row.additionalComments)}</textarea></td>
      <td class="action-column"><button class="danger-button small-button" data-remove-row type="button">Remove</button></td>
    `;
    container.append(tr);
  }

  function readDivisions(form) {
    return Array.from(form.querySelectorAll("#divisionRows tr"))
      .map((row) => ({
        division: row.querySelector('[data-division-field="division"]').value.trim(),
        comments: row.querySelector('[data-division-field="comments"]').value.trim(),
        additionalComments: row.querySelector('[data-division-field="additionalComments"]').value.trim()
      }))
      .filter((row) => row.division || row.comments || row.additionalComments);
  }

  function syncTimelineDateVisibility(form, container) {
    const hasDate = form.elements.timelineType.value === "date";
    container.hidden = !hasDate;
    if (!hasDate) {
      form.elements.timelineDate.value = "";
    }
  }

  function createStoredImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        type: file.type,
        dataUrl: reader.result
      });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function updateImagePreview(image) {
    const preview = document.getElementById("imagePreview");
    const img = document.getElementById("proposalImagePreview");
    const name = document.getElementById("proposalImageName");
    const removeButton = document.getElementById("removeImageButton");
    const hasImage = Boolean(image && image.dataUrl);

    preview.hidden = !hasImage;
    removeButton.hidden = !hasImage;
    if (hasImage) {
      img.src = image.dataUrl;
      name.textContent = image.name || "Uploaded image";
    } else {
      img.removeAttribute("src");
      name.textContent = "";
    }
  }

  function readForm(form, image) {
    return {
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      timelineType: form.elements.timelineType.value,
      timelineDate: form.elements.timelineType.value === "date" ? form.elements.timelineDate.value : "",
      notes: form.elements.notes.value.trim(),
      divisions: readDivisions(form),
      image,
      status: form.elements.status.value
    };
  }

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function textOrFallback(value, fallback) {
    return value && value.trim() ? value : fallback;
  }

  function getTimelineLabel(proposal) {
    if (proposal.timelineType === "date" && proposal.timelineDate) {
      return formatDate(proposal.timelineDate + "T00:00:00");
    }
    return "No fixed date";
  }

  function renderDetail(id) {
    const proposal = getProposal(id);
    if (!proposal) {
      renderNotFound();
      return;
    }

    app.innerHTML = "";
    app.append(document.getElementById("detailTemplate").content.cloneNode(true));

    document.title = proposal.title + " - Proposal Manager";
    document.getElementById("detailDate").textContent = formatDate(proposal.updatedAt);
    document.getElementById("detailTitle").textContent = textOrFallback(proposal.title, "Untitled Proposal");
    document.getElementById("detailDescription").textContent = textOrFallback(proposal.description, "Project description has not been added yet.");
    document.getElementById("detailTimeline").textContent = getTimelineLabel(proposal);
    document.getElementById("detailNotes").textContent = textOrFallback(proposal.notes, "No additional notes.");

    const detailImageSection = document.getElementById("detailImageSection");
    const detailImage = document.getElementById("detailImage");
    if (proposal.image && proposal.image.dataUrl) {
      detailImageSection.hidden = false;
      detailImage.src = proposal.image.dataUrl;
      detailImage.alt = proposal.image.name || "Uploaded proposal reference";
    }

    const tableRows = proposal.divisions || [];
    const detailTableSection = document.getElementById("detailTableSection");
    const detailDivisionRows = document.getElementById("detailDivisionRows");
    if (tableRows.length) {
      detailTableSection.hidden = false;
      detailDivisionRows.innerHTML = tableRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.division)}</td>
          <td>${escapeHtml(row.comments)}</td>
          <td>${escapeHtml(row.additionalComments)}</td>
        </tr>
      `).join("");
    }

    const status = document.getElementById("detailStatus");
    status.textContent = proposal.status;
    status.classList.add(statusClass(proposal.status));

    document.getElementById("editDetailButton").href = "#/edit/" + encodeURIComponent(proposal.id);
    document.getElementById("pdfButton").addEventListener("click", () => window.print());
    document.getElementById("deleteDetailButton").addEventListener("click", () => {
      if (confirm("Delete this proposal permanently?")) {
        proposals = proposals.filter((item) => item.id !== proposal.id);
        saveProposals();
        navigate("#/");
      }
    });
  }

  function renderNotFound() {
    app.innerHTML = `
      <section class="panel not-found">
        <p class="eyebrow">Not found</p>
        <h1>We could not find that proposal.</h1>
        <p>It may have been deleted or the link may be incorrect.</p>
        <a class="primary-button" href="#/">Back to Dashboard</a>
      </section>
    `;
  }

  function downloadBackup() {
    const payload = {
      exportedAt: todayISO(),
      app: "Proposal Manager",
      version: 1,
      proposals
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "proposal-manager-backup.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const imported = Array.isArray(data) ? data : data.proposals;
        if (!Array.isArray(imported)) throw new Error("Invalid backup format");
        proposals = imported.map(normalizeProposal);
        saveProposals();
        render();
        alert("Backup imported successfully.");
      } catch (error) {
        alert("That file does not look like a valid Proposal Manager backup.");
      } finally {
        importInput.value = "";
      }
    };
    reader.readAsText(file);
  }

  backupButton.addEventListener("click", downloadBackup);
  importInput.addEventListener("change", () => {
    const file = importInput.files && importInput.files[0];
    if (file && confirm("Importing will replace current proposals. Continue?")) {
      importBackup(file);
    } else {
      importInput.value = "";
    }
  });
  themeToggle.addEventListener("click", () => {
    setTheme(document.body.classList.contains("dark") ? "light" : "dark");
  });
  window.addEventListener("hashchange", render);

  initTheme();
  render();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
})();
