#!/usr/bin/env python3
"""Local static file server with a same-origin Gemini proxy."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode
import json
import os
import urllib.error
import urllib.request

MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
]
PORT = int(os.environ.get("PORT", "8765"))


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        if self.path != "/api/gemini":
            self.send_error(404, "Not found")
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        api_key = self.headers.get("X-API-Key") or os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            self._json(400, {"error": "Gemini API 키가 필요합니다."})
            return

        last_error = None
        for model in MODELS:
            url = (
                "https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?{urlencode({'key': api_key})}"
            )
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:
                    payload = resp.read()
                    self.send_response(resp.status)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                    return
            except urllib.error.HTTPError as err:
                last_error = err.read().decode("utf-8", "ignore")
                if err.code not in (404, 400):
                    self._json(err.code, {"error": "Gemini API 오류", "detail": last_error})
                    return
            except Exception as err:
                self._json(502, {"error": str(err)})
                return
        self._json(502, {"error": "Gemini API 오류", "detail": last_error})

    def _json(self, status, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        if self.path == "/api/gemini":
            return
        super().log_message(fmt, *args)


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"스마트 사진 편집: http://127.0.0.1:{PORT}/")
    httpd.serve_forever()
