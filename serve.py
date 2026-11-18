# Play-test server: `python -m http.server`, but it tells browsers to check for a newer copy of every file on each
# load (they get a quick "not modified" when nothing changed). Without it, browsers may keep using an old cached
# module after an edit, so an update looks like it did nothing, or old and new modules mix and the page breaks.
# Usage: python serve.py [port]   (default 8000; reachable from other devices on the same network)
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f'Serving Bus Traffic on http://localhost:{port}  (Ctrl+C to stop)')
http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
