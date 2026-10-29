# Pulse AI Assistant 🚀

A modern, high-performance, full-stack AI Assistant application built using Python FastAPI and Google's official `google-genai` SDK (`gemini-3.6-flash`, `gemini-2.5-flash`, `gemini-1.5-flash`).

![Pulse AI](static/index.html)

## Features ⚡

- **Real-Time Streaming Responses**: Instant response generation using Server-Sent Events (SSE).
- **Google GenAI SDK**: Powered by the latest official `google-genai` library.
- **Multimodal Support**: Attach images and ask Gemini questions about visual content.
- **Markdown & Code Highlighting**: Renders rich text, tables, lists, math, and syntax-highlighted code blocks with a one-click **Copy Code** button.
- **Voice / Speech Input**: Built-in speech-to-text voice dictation.
- **Session & History Management**: Save, view, and delete previous chat conversations (persisted in LocalStorage).
- **Model Selector & Persona Tuning**: Switch models dynamically and customize temperature & system prompt instructions.
- **Glassmorphism Dark UI**: Ultra-sleek dark mode design with modern typography (`Outfit`, `Inter`, `Fira Code`) and subtle animations.

---

## Quick Start 🛠️

### Prerequisites
- Python 3.10+ installed
- Google Gemini API Key (Get a key for free at [Google AI Studio](https://aistudio.google.com/))

### 1. Set Up Virtual Environment & Dependencies

```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1

# On Linux/macOS:
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Configure API Key

Create or edit `.env` in the project root:
```env
GEMINI_API_KEY=your_actual_api_key_here
PORT=8000
HOST=0.0.0.0
```

*(Note: You can also enter or update your API key directly inside the web UI via the API Key modal).*

### 3. Run the Chatbot

```bash
python run.py
```

Open your browser and navigate to: **`https://pulse-ai-6vmz.onrender.com`**

---

## Project Structure 📂

```
CHATBOT/
├── .venv/               # Virtual environment directory
├── .env                 # Environment variables (API keys, ports)
├── .env.example         # Example configuration file
├── requirements.txt     # Python project dependencies
├── main.py              # FastAPI server & streaming API endpoints
├── run.py               # Application launcher
├── static/              # Frontend web application assets
│   ├── index.html       # Single-page web application UI
│   ├── css/
│   │   └── style.css    # Custom dark mode glassmorphism styles
│   └── js/
│       └── app.js       # Client side SSE streaming & chat logic
└── README.md            # Project documentation
```

---

## License 📄
MIT License. Built with Google Gemini.
