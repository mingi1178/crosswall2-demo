#!/usr/bin/env python3
"""Start Crosswall on loopback and open it in the default browser."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

handler = partial(SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    url = f"http://127.0.0.1:{server.server_port}/"
    print(f"Crosswall  {url}\n종료하려면 Control+C를 누르세요.", flush=True)
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
