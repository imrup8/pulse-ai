import os
import sys
import subprocess
import json
import base64
import logging
from typing import List, Optional

try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_auth_requests
except ImportError:
    google_id_token = None
    google_auth_requests = None

# Auto-switch to virtual environment if running outside .venv
try:
    from fastapi import FastAPI, HTTPException, Header
    from fastapi.responses import StreamingResponse, FileResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from dotenv import load_dotenv
except ImportError:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    venv_python = os.path.join(base_dir, ".venv", "Scripts", "python.exe") if sys.platform == "win32" else os.path.join(base_dir, ".venv", "bin", "python")
    if os.path.exists(venv_python) and os.path.abspath(sys.executable) != os.path.abspath(venv_python):
        print(f"Switching to virtual environment: {venv_python}")
        result = subprocess.run([venv_python] + sys.argv)
        sys.exit(result.returncode)
    else:
        print("Installing missing dependencies from requirements.txt...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
        from fastapi import FastAPI, HTTPException, Header
        from fastapi.responses import StreamingResponse, FileResponse
        from fastapi.staticfiles import StaticFiles
        # pyrefly: ignore [missing-import]
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel
        from dotenv import load_dotenv


# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pulse_ai")

app = FastAPI(title="Pulse AI Assistant API")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to get GenAI Client
def get_genai_client(custom_api_key: Optional[str] = None):
    from google import genai
    from dotenv import load_dotenv
    load_dotenv(override=True)

    api_key = custom_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        api_key = api_key.strip()

    if not api_key:
        # Try initializing default client (which auto-detects env vars)
        try:
            return genai.Client()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Gemini API Key is missing. Please set GEMINI_API_KEY in .env or pass it in settings."
            )
    return genai.Client(api_key=api_key)

# Request Models
class HistoryItem(BaseModel):
    role: str # "user" or "model"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[HistoryItem]] = []
    model: Optional[str] = "gemini-3.6-flash"
    system_instruction: Optional[str] = None
    temperature: Optional[float] = 0.7
    image_data: Optional[str] = None # Base64 data URL for backward compatibility
    file_data: Optional[str] = None # Base64 data URL for documents/images
    file_name: Optional[str] = None
    api_key: Optional[str] = None

class SaveApiKeyRequest(BaseModel):
    api_key: str

# --- Auth Helpers ---
def verify_google_token(token: str):
    """Verify a Google ID token and return the decoded user info."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured on server.")
    if not google_id_token or not google_auth_requests:
        raise HTTPException(status_code=500, detail="google-auth library not installed.")
    try:
        idinfo = google_id_token.verify_oauth2_token(
            token, google_auth_requests.Request(), client_id
        )
        return idinfo
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")

@app.get("/api/health")
async def health_check():
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return {
        "status": "healthy",
        "has_api_key": bool(api_key and len(api_key.strip()) > 0)
    }

# --- Auth Endpoints ---
@app.get("/api/auth/config")
async def auth_config():
    """Return the Google Client ID so the frontend can initialize GIS."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    return {"google_client_id": client_id, "auth_enabled": bool(client_id)}

class VerifyTokenRequest(BaseModel):
    token: str

@app.post("/api/auth/verify")
async def auth_verify(req: VerifyTokenRequest):
    """Verify a Google ID token and return user info."""
    idinfo = verify_google_token(req.token)
    return {
        "valid": True,
        "user": {
            "email": idinfo.get("email", ""),
            "name": idinfo.get("name", ""),
            "picture": idinfo.get("picture", ""),
            "sub": idinfo.get("sub", "")
        }
    }

@app.post("/api/save-key")
async def save_api_key(req: SaveApiKeyRequest):
    if not req.api_key or len(req.api_key.strip()) < 5:
        raise HTTPException(status_code=400, detail="Invalid API key provided.")
    
    # Update current process env
    os.environ["GEMINI_API_KEY"] = req.api_key.strip()
    
    # Write to .env file
    try:
        env_content = f"GEMINI_API_KEY={req.api_key.strip()}\nPORT=8000\nHOST=0.0.0.0\n"
        with open(".env", "w", encoding="utf-8") as f:
            f.write(env_content)
    except Exception as e:
        logger.warning(f"Could not save API key to .env file: {e}")
        
    return {"status": "success", "message": "API Key saved successfully."}

@app.get("/api/models")
async def list_models():
    # Return available recommended models
    models = [
        {
            "id": "gemini-3.6-flash",
            "name": "Gemini 3.6 Flash",
            "description": "Latest fast and versatile multimodal model (Recommended)"
        },
        {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "description": "Fast multimodal model for everyday tasks"
        },
        {
            "id": "gemini-1.5-flash",
            "name": "Gemini 1.5 Flash",
            "description": "Lightweight, super-fast model for simple chat"
        }
    ]
    return {"models": models}

@app.post("/api/chat")
async def chat_stream(req: ChatRequest, x_api_key: Optional[str] = Header(None), authorization: Optional[str] = Header(None)):
    from google.genai import types
    
    # Verify Google auth token if auth is enabled
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if google_client_id:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authentication required. Please sign in with Google.")
        token = authorization.replace("Bearer ", "", 1)
        verify_google_token(token)  # raises 401 if invalid
    
    api_key_override = req.api_key or x_api_key
    client = get_genai_client(api_key_override)
    
    selected_model = req.model or "gemini-3.6-flash"
    
    # Format chat history for SDK
    contents = []
    if req.history:
        for item in req.history:
            role = "user" if item.role in ["user", "human"] else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=item.content)]
                )
            )

    # Process prompt & optional file/image attachment
    user_parts = []
    attachment_payload = req.file_data or req.image_data
    if attachment_payload and "," in attachment_payload:
        try:
            header, encoded = attachment_payload.split(",", 1)
            mime_type = header.split(";")[0].split(":")[1] if ";" in header and ":" in header else "application/octet-stream"
            raw_bytes = base64.b64decode(encoded)
            filename = req.file_name or "attached_file"

            # Pass images and PDFs directly as native SDK byte parts
            if mime_type.startswith("image/") or mime_type == "application/pdf":
                user_parts.append(types.Part.from_bytes(data=raw_bytes, mime_type=mime_type))
            else:
                # Decode text/code documents
                try:
                    text_content = raw_bytes.decode("utf-8")
                except UnicodeDecodeError:
                    text_content = raw_bytes.decode("latin-1", errors="ignore")
                
                doc_prompt = f"\n--- ATTACHED FILE ({filename}) ---\n{text_content}\n--- END OF ATTACHED FILE ---\n"
                user_parts.append(types.Part.from_text(text=doc_prompt))
        except Exception as e:
            logger.error(f"Error decoding attached file: {e}")

    user_parts.append(types.Part.from_text(text=req.message))
    contents.append(types.Content(role="user", parts=user_parts))

    # Configuration options
    config_params = {}
    if req.temperature is not None:
        config_params["temperature"] = req.temperature
    if req.system_instruction and req.system_instruction.strip():
        config_params["system_instruction"] = req.system_instruction.strip()

    config = types.GenerateContentConfig(**config_params) if config_params else None

    async def event_generator():
        try:
            response_stream = client.models.generate_content_stream(
                model=selected_model,
                contents=contents,
                config=config
            )
            for chunk in response_stream:
                if chunk.text:
                    data_json = json.dumps({"text": chunk.text})
                    yield f"data: {data_json}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as err:
            logger.error(f"Error during streaming: {err}")
            err_json = json.dumps({"error": str(err)})
            yield f"data: {err_json}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Serve Frontend static directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Pulse AI Assistant API is running. Static files missing."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=port, reload=True)
