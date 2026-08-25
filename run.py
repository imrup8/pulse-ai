"""
Pulse AI Application Runner
"""
import os
import sys
import subprocess

# Ensure UTF-8 output encoding for Windows terminal compatibility
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def ensure_venv():
    """Ensure required packages are available, auto-switching to .venv if present."""
    try:
        import fastapi
        import google.genai
        import uvicorn
        return
    except ImportError:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if sys.platform == "win32":
            venv_python = os.path.join(base_dir, ".venv", "Scripts", "python.exe")
        else:
            venv_python = os.path.join(base_dir, ".venv", "bin", "python")

        if os.path.exists(venv_python) and os.path.abspath(sys.executable) != os.path.abspath(venv_python):
            print(f"Detected .venv! Automatically switching to virtual environment...")
            result = subprocess.run([venv_python] + sys.argv)
            sys.exit(result.returncode)
        else:
            print("Installing missing dependencies from requirements.txt...")
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)

def check_env():
    if not os.path.exists(".env"):
        if os.path.exists(".env.example"):
            print("Creating .env file from .env.example...")
            with open(".env.example", "r", encoding="utf-8") as src, open(".env", "w", encoding="utf-8") as dst:
                dst.write(src.read())
        else:
            with open(".env", "w", encoding="utf-8") as f:
                f.write("GEMINI_API_KEY=\nPORT=8000\nHOST=0.0.0.0\n")

def main():
    ensure_venv()

    print("=" * 60)
    print("Starting Pulse AI Application...")
    print("=" * 60)

    check_env()

    port = 8000
    url = f"http://localhost:{port}"

    print(f"Server is starting at: {url}")
    print("Press Ctrl+C to stop the server.\n")

    try:
        import uvicorn
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
    except KeyboardInterrupt:
        print("\nServer stopped successfully.")
    except Exception as e:
        print(f"Error starting server: {e}")

if __name__ == "__main__":
    main()
