"""Server statico per provare l'app in locale (senza cache): python tests/serve.py [porta] [cartella]"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent.parent)
    print(f"http://127.0.0.1:{port}/  ({root})", flush=True)
    Server(("127.0.0.1", port), partial(Handler, directory=root)).serve_forever()
