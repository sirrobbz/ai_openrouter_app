# AI Support Chatbot — Flask + OpenRouter + RAG

A friendly AI chatbot built with **Flask** and **OpenRouter** that supports document uploading (PDF, TXT, DOCX, MD, CSV) and retrieval-augmented generation (RAG).

## Features

- 💬 Chat with any LLM available on OpenRouter
- 📄 Upload documents — the AI reads and answers questions about them
- 🗂  Manages multiple documents simultaneously (remove anytime)
- 🔄 Full conversation history maintained per session

## Setup

### 1. Clone / unzip the project

```bash
cd flask_chatbot
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure your API key

```bash
cp .env.example .env
# Edit .env and paste your OPENROUTER_API_KEY
```

Get a free key at [openrouter.ai](https://openrouter.ai).

### 5. Run the server

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

## Project Structure

```
flask_chatbot/
├── app.py                  ← Flask server (routes, RAG, OpenRouter)
├── requirements.txt
├── .env
├── uploads/                ← Uploaded files stored here
├── templates/
│   └── index.html          ← Main UI
└── static/
    ├── css/style.css
    └── js/app.js
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Serve chat UI |
| POST | `/upload` | Upload & index a document |
| GET | `/documents` | List indexed documents |
| DELETE | `/documents/<name>` | Remove a document |
| POST | `/chat` | Send message, get AI reply |

### POST /chat — body

```json
{
  "message": "What does the document say about pricing?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

## Changing the Model

Edit `.env`:

```
MODEL=meta-llama/llama-3.3-70b-instruct:free
```

All free models on OpenRouter work out of the box.
