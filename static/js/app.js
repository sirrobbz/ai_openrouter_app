// ==========================
// STATE
// ==========================
let conversationHistory = [];   // [{role, content}, ...]
let indexedDocs = [];           // [{name, words}, ...]

// ==========================
// DOM ELEMENTS
// ==========================
const messagesDiv   = document.getElementById("messages");
const fileInput     = document.getElementById("fileInput");
const uploadBtn     = document.getElementById("uploadBtn");
const inputField    = document.getElementById("input");
const sendBtn       = document.getElementById("sendBtn");
const typingEl      = document.getElementById("typing");
const uploadStatus  = document.getElementById("uploadStatus");
const fileLabel     = document.getElementById("fileLabel");
const docList       = document.getElementById("docList");
const docBadge      = document.getElementById("docBadge");
const docCountEl    = document.getElementById("docCount");

// ==========================
// MESSAGE RENDERING
// ==========================
function addMessage(sender, text) {
    const wrapper = document.createElement("div");

    if (sender === "user") {
        wrapper.className = "message-user p-3 max-w-[80%] ml-auto text-base shadow-lg";
        wrapper.textContent = text;
    } else if (sender === "system") {
        wrapper.className = "message-system mx-auto my-1";
        wrapper.textContent = text;
    } else {
        wrapper.className = "message-bot p-4 max-w-[85%] text-base shadow-lg";
        // Render basic markdown-ish formatting
        wrapper.innerHTML = renderMarkdown(text);
    }

    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return wrapper;
}

/**
 * Very lightweight markdown renderer:
 * - ```code blocks```
 * - `inline code`
 * - **bold**
 * - bullet lists (- or *)
 * - line breaks
 */
function renderMarkdown(text) {
    // Escape HTML first
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Fenced code blocks
    html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
        `<pre><code>${code.trim()}</code></pre>`
    );

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Bullet lists
    html = html.replace(/^[ \t]*[-*] (.+)/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul class='list-disc pl-4 mt-1 space-y-0.5'>$1</ul>");

    // Paragraphs / line breaks
    html = html.replace(/\n{2,}/g, "</p><p class='mt-2'>").replace(/\n/g, "<br>");
    html = `<p>${html}</p>`;

    return html;
}

function showTyping(visible) {
    typingEl.classList.toggle("hidden", !visible);
    if (visible) messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ==========================
// DOCUMENT CHIPS
// ==========================
function refreshDocUI() {
    docList.innerHTML = "";
    if (indexedDocs.length === 0) {
        docList.classList.add("hidden");
        docBadge.classList.add("hidden");
        return;
    }
    docList.classList.remove("hidden");
    docBadge.classList.remove("hidden");
    docCountEl.textContent = indexedDocs.length;

    indexedDocs.forEach(doc => {
        const chip = document.createElement("span");
        chip.className = "doc-chip";
        chip.title = `${doc.name} (${doc.words.toLocaleString()} words)`;
        chip.innerHTML = `
            <i class="fa-solid fa-file-lines"></i>
            <span class="truncate">${doc.name}</span>
            <span class="remove-doc" data-name="${doc.name}" title="Remove">✕</span>
        `;
        docList.appendChild(chip);
    });

    // Delete handlers
    docList.querySelectorAll(".remove-doc").forEach(btn => {
        btn.addEventListener("click", () => removeDoc(btn.dataset.name));
    });
}

async function removeDoc(filename) {
    try {
        const res = await fetch(`/documents/${encodeURIComponent(filename)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        indexedDocs = indexedDocs.filter(d => d.name !== filename);
        refreshDocUI();
        addMessage("system", `📄 "${filename}" removed from knowledge base.`);
    } catch (e) {
        addMessage("system", `⚠️ Could not remove "${filename}".`);
    }
}

// ==========================
// FILE SELECTION DISPLAY
// ==========================
fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    fileLabel.textContent = f ? f.name : "Attach a file (.pdf .txt .docx .md .csv)";
    fileLabel.style.color  = f ? "#ff9f1c" : "";
    uploadStatus.textContent = "";
});

// ==========================
// UPLOAD LOGIC
// ==========================
uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file) {
        setUploadStatus("⚠️ Please select a file first.", "warn");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setUploadStatus("⏳ Uploading & indexing document…", "info");
    uploadBtn.disabled = true;

    try {
        const res = await fetch("/upload", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Server error");

        setUploadStatus(data.message, "ok");
        addMessage("system", `📚 Indexed: "${data.filename}" (${(data.word_count || 0).toLocaleString()} words)`);

        // Update local doc list
        indexedDocs = indexedDocs.filter(d => d.name !== data.filename);
        indexedDocs.push({ name: data.filename, words: data.word_count || 0 });
        refreshDocUI();

        // Reset file input
        fileInput.value = "";
        fileLabel.textContent = "Attach a file (.pdf .txt .docx .md .csv)";
        fileLabel.style.color = "";
    } catch (err) {
        setUploadStatus(`❌ Upload failed: ${err.message}`, "error");
    } finally {
        uploadBtn.disabled = false;
    }
});

function setUploadStatus(msg, type) {
    uploadStatus.textContent = msg;
    const colors = { ok: "#4ade80", error: "#f87171", warn: "#facc15", info: "#ff9f1c" };
    uploadStatus.style.color = colors[type] || "#9ca3af";
}

// ==========================
// DRAG & DROP
// ==========================
const dropZone = document.getElementById("dropZone");
["dragenter", "dragover"].forEach(evt =>
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.style.borderColor = "#ff9f1c";
    })
);
["dragleave", "drop"].forEach(evt =>
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.style.borderColor = "";
    })
);
dropZone.addEventListener("drop", e => {
    const file = e.dataTransfer.files[0];
    if (file) {
        // Assign to hidden input via DataTransfer
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileLabel.textContent = file.name;
        fileLabel.style.color = "#ff9f1c";
    }
});

// ==========================
// CHAT LOGIC
// ==========================
async function handleSend() {
    const text = inputField.value.trim();
    if (!text) return;

    addMessage("user", text);
    inputField.value = "";
    inputField.disabled = true;
    sendBtn.disabled = true;
    showTyping(true);

    try {
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, history: conversationHistory }),
        });
        const data = await res.json();

        showTyping(false);

        if (!res.ok) throw new Error(data.error || "Server error");

        addMessage("bot", data.reply || "(no response)");
        conversationHistory = data.updated_history || conversationHistory;
    } catch (err) {
        showTyping(false);
        addMessage("bot", `❌ Error: ${err.message}. Check your server or API key.`);
    } finally {
        inputField.disabled = false;
        sendBtn.disabled = false;
        inputField.focus();
    }
}

sendBtn.addEventListener("click", handleSend);
inputField.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) handleSend(); });

// ==========================
// INIT
// ==========================
window.addEventListener("load", () => {
    addMessage("bot", "👋 Hey there! I'm your AI assistant. You can chat with me about anything, or upload a document and I'll answer questions about it. What can I help you with?");
    inputField.focus();
});
