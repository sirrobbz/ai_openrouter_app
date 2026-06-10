import os
import time
from pathlib import Path
from flask import Flask, request, jsonify, render_template
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from openai import OpenAI

# ── Load .env from the app root (same folder as app.py / requirements.txt) ───
ROOT_DIR = Path(__file__).parent.resolve()
load_dotenv(dotenv_path=ROOT_DIR / ".env")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32 MB upload limit
UPLOAD_FOLDER = Path(__file__).parent / "uploads"
UPLOAD_FOLDER.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {"pdf", "txt", "docx", "md", "csv"}

# ── OpenRouter client ─────────────────────────────────────────────────────────
api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    print("⚠  WARNING: OPENROUTER_API_KEY not set – AI responses will fail.")

openrouter = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=api_key or "missing",
)

MODEL = os.getenv("MODEL", "openai/gpt-oss-120b:free")

# ── In-memory knowledge base (simple RAG store) ───────────────────────────────
knowledge_base: dict[str, str] = {}   # filename → extracted text


# ── Helpers ───────────────────────────────────────────────────────────────────
def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_text(filepath: Path, extension: str) -> str:
    """Extract plain text from uploaded file."""
    if extension == "pdf":
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(filepath) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        text_parts.append(t)
            return "\n".join(text_parts)
        except ImportError:
            return f"[PDF content from {filepath.name} – install pdfplumber to parse PDFs]"
    elif extension == "docx":
        try:
            import docx
            doc = docx.Document(filepath)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            return f"[DOCX content from {filepath.name} – install python-docx to parse DOCX]"
    else:
        # txt, md, csv – plain read
        try:
            return filepath.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"[Could not read {filepath.name}: {e}]"


def build_system_prompt() -> str:
    base = (
        "You are a friendly, knowledgeable AI assistant. "
        "You are helpful, warm, and conversational. "
        "You answer questions on any topic clearly and thoroughly. "
        "If the user asks something you are unsure about, say so honestly and offer alternatives. "
        "When document context is provided, prioritise that information in your answer, "
        "but you may also draw on your general knowledge when relevant."
    )
    if knowledge_base:
        docs_block = "\n\n".join(
            f"### Document: {name}\n{content[:6000]}"  # cap per doc to avoid token overflow
            for name, content in knowledge_base.items()
        )
        return (
            base
            + "\n\n"
            + "--- UPLOADED DOCUMENT CONTEXT ---\n"
            + docs_block
            + "\n--- END OF DOCUMENT CONTEXT ---"
        )
    return base


def call_openrouter(messages: list, retries: int = 2) -> str:
    for attempt in range(retries):
        try:
            resp = openrouter.chat.completions.create(
                model=MODEL,
                messages=messages,
                max_tokens=1500,
                temperature=0.7,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            err = str(e)
            if "429" in err and attempt < retries - 1:
                time.sleep(20)
                continue
            raise


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": f"File type not allowed. Accepted: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit(".", 1)[1].lower()
    save_path = UPLOAD_FOLDER / filename
    file.save(save_path)

    # Extract and store text
    text = extract_text(save_path, ext)
    knowledge_base[filename] = text

    word_count = len(text.split())
    return jsonify({
        "message": f"✅ '{filename}' uploaded and indexed ({word_count:,} words extracted).",
        "filename": filename,
        "word_count": word_count,
    })


@app.route("/documents", methods=["GET"])
def documents():
    docs = [
        {"name": name, "words": len(text.split())}
        for name, text in knowledge_base.items()
    ]
    return jsonify({"documents": docs})


@app.route("/documents/<filename>", methods=["DELETE"])
def delete_document(filename):
    if filename in knowledge_base:
        del knowledge_base[filename]
        return jsonify({"message": f"'{filename}' removed from knowledge base."})
    return jsonify({"error": "Document not found"}), 404


@app.route("/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}
    user_message = (body.get("message") or "").strip()
    history = body.get("history") or []   # list of {role, content} dicts

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    # Build message list: system + prior history + new user turn
    messages = [{"role": "system", "content": build_system_prompt()}]
    # Keep last 20 turns max to avoid context overflow
    for turn in history[-20:]:
        if isinstance(turn, dict) and turn.get("role") in ("user", "assistant"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        reply = call_openrouter(messages)
    except Exception as e:
        return jsonify({"error": f"AI error: {e}"}), 500

    return jsonify({
        "reply": reply,
        "updated_history": [
            *history,
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": reply},
        ],
    })


if __name__ == "__main__":
    from werkzeug.serving import run_simple
    extra_files = [ROOT_DIR / ".env"]
    app.run(debug=True, port=5000, use_reloader=True, reloader_type="watchdog",
    extra_files=[str(f) for f in extra_files],)
