import os
from pathlib import Path
from huggingface_hub import hf_hub_download

def download_tts_models():
    """
    Downloads the Kokoro ONNX model and voice palette from Hugging Face
    if they are not already present in the engines/ directory.
    """
    repo_id = "onnx-community/Kokoro-82M-v1.0-ONNX"
    
    # Target directory is tts/engines/
    target_dir = Path(__file__).parent / "engines"
    target_dir.mkdir(parents=True, exist_ok=True)

    files = [
        "kokoro-v1.0.onnx",
        "voices-v1.0.bin"
    ]

    print(f"[*] Checking for TTS models in {target_dir}...")

    for filename in files:
        dest_path = target_dir / filename
        if dest_path.exists() and dest_path.stat().st_size > 0:
            print(f"[*] {filename} already exists. Skipping download.")
            continue

        print(f"[*] Downloading {filename} from {repo_id}...")
        try:
            downloaded_path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                local_dir=target_dir,
                local_dir_use_symlinks=False
            )
            print(f"[+] Successfully downloaded {filename} to {downloaded_path}")
        except Exception as e:
            print(f"[!] Error downloading {filename}: {e}")
            # Ensure we don't leave a broken file
            if dest_path.exists():
                dest_path.unlink()
            raise

if __name__ == "__main__":
    download_tts_models()
