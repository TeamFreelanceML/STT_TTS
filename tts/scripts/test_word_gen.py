import requests
import json

payload = {
    "voice": {
        "voice_id": "bf_isabella",
        "language": "en-US"
    },
    "speech_config": {
        "wpm": 140
    },
    "word": "Hello"
}

try:
    print("Testing Word Level Gen...")
    resp = requests.post("http://localhost:8001/narrate/word", json=payload)
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json(), indent=2))
except Exception as e:
    print(f"Test failed: {e}")
