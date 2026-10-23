"""
CineMatch - Unified Demo Runner
Starts the FastAPI server, serves the Fire TV web frontend, and detects LAN IP for Fire TV testing.
"""

import os
import socket
import sys
import uvicorn

def get_lan_ip():
    """Detect local network IP for Fire TV Silk Browser / Web App Tester."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def main():
    lan_ip = get_lan_ip()
    port = 8000

    print("=" * 65)
    print(" 🎬 CineMatch - Fire TV Movie Akinator (Amazon Hackathon 2026)")
    print("=" * 65)
    print(f"\n[*] Desktop Browser URL:    http://localhost:{port}")
    print(f"[*] Fire TV Tester URL:     http://{lan_ip}:{port}")
    print("\n[Testing on Amazon Fire TV]:")
    print("  1. Ensure Fire TV and this PC are on the same Wi-Fi network.")
    print("  2. Open Amazon Silk Browser or Web App Tester on Fire TV.")
    print(f"  3. Navigate to: http://{lan_ip}:{port}")
    print("  4. Press Full Screen and enjoy with your Fire TV Remote!")
    print("\n[Controls]:")
    print("  • Remote D-Pad (Up, Down, Left, Right): Navigate choices")
    print("  • Select / OK: Choose focused option")
    print("  • Back: Undo or Restart")
    print("=" * 65 + "\n")

    # Change to root project directory
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root_dir)

    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)

if __name__ == "__main__":
    main()
