"""Headless-browser helpers: serve public/ on a virtual public hostname and capture errors.

The virtual host matters: the contract (and its JS mirror) refuse localhost links, so demo
evidence has to live on a public-looking origin. No real network is touched.
"""
import mimetypes
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
ORIGIN = "https://tessera.test"


def serve(context, extra=None):
    def handler(route):
        url = route.request.url
        if not url.startswith(ORIGIN):
            return route.abort()
        path = url[len(ORIGIN):].split("?")[0].split("#")[0] or "/"
        if extra and path in extra:
            status, ctype, body = extra[path]
            return route.fulfill(status=status, content_type=ctype, body=body)
        if path.startswith("/api/"):
            return route.fulfill(status=404, body="no functions in the local harness")
        if path.endswith("/"):
            path += "index.html"
        file = os.path.join(PUBLIC, path.lstrip("/"))
        if os.path.isfile(file):
            ctype = mimetypes.guess_type(file)[0] or "application/octet-stream"
            with open(file, "rb") as fh:
                return route.fulfill(status=200, content_type=ctype, body=fh.read())
        return route.fulfill(status=404, content_type="text/plain", body="not found")
    context.route("**/*", handler)


def watch(page, log):
    page.on("console", lambda m: log.append(("console." + m.type, m.text)) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: log.append(("pageerror", str(e))))
