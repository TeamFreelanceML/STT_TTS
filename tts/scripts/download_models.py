#!/usr/bin/env python3
"""
download_models.py

Utility script to automatically download the massive Kokoro AI voice models 
(ONNX weights and voice profiles) that are excluded from version control.
Runs automatically to populate the `engines/` directory for new developers.
"""

import os
import urllib.request
import sys

# Core Kokoro ONNX model URLs used by the community
MODELS = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin":  "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
}

ENGINES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "engines")


def download_file(url: str, dest_path: str):
    print(f"\nDownloading {os.path.basename(dest_path)}...")
    print(f"Source: {url}")
    
    try:
        # Simple reporthook for progress
        def progress(count, block_size, total_size):
            percent = int(count * block_size * 100 / total_size)
            sys.stdout.write(f"\rDownloading: {percent}%")
            sys.stdout.flush()

        urllib.request.urlretrieve(url, dest_path, reporthook=progress)
        print("\n✅ Download complete!")
    except Exception as e:
        print(f"\n❌ Error downloading {os.path.basename(dest_path)}: {e}")
        sys.exit(1)


def main():
    os.makedirs(ENGINES_DIR, exist_ok=True)

    print("═════════════════════════════════════════════════")
    print("      TTS Studio - AI Model Downloader")
    print("═════════════════════════════════════════════════")
    print(f"Target Directory: {ENGINES_DIR}")
    
    for filename, url in MODELS.items():
        dest = os.path.join(ENGINES_DIR, filename)
        if os.path.exists(dest):
            print(f"\n⚡ {filename} already exists. Skipping.")
        else:
            download_file(url, dest)

    print("\n🎉 All AI models are ready! You can now run the server.")

if __name__ == "__main__":
    main()
