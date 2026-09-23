#!/usr/bin/env python3
"""A site that answers 200 with a body that has no title, so the trap for that can be tested.

ops/check-pages.sh keeps the body of any page that answers without a title, because that failure
took three cycles to explain and the evidence kept being gone by the time anybody looked. A trap
nobody has seen fire is a trap nobody should trust, and this is the smallest thing that fires it.

  python3 ops/fixtures/broken-site.py &
  CP_URL=http://127.0.0.1:8903 ops/check-pages.sh

/b is the broken one. Everything else answers normally, and the sitemap names six pages so the
page list clears the minimum the script insists on.

It lives here and not in /tmp because the last copy of it was gone within the hour, and so was the
evidence file it existed to produce.
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8903
PAGES = ["/", "/a", "/b", "/c", "/d", "/e"]
SITEMAP = ("<?xml version='1.0'?><urlset>" +
           "".join("<loc>http://127.0.0.1:%d%s</loc>" % (PORT, "" if p == "/" else p) for p in PAGES) +
           "</urlset>")
GOOD = "<!doctype html><html><head><title>fine</title></head><body><h1>ok</h1></body></html>"
NO_TITLE = "<!doctype html><html><head></head><body><h1>no title here</h1></body></html>"


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/sitemap.xml":
            body, ctype = SITEMAP, "application/xml"
        elif path == "/b":
            body, ctype = NO_TITLE, "text/html; charset=UTF-8"
        elif path in PAGES:
            body, ctype = GOOD, "text/html; charset=UTF-8"
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"no")
            return
        data = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as srv:
        print("serving a site with one untitled page on http://127.0.0.1:%d" % PORT, file=sys.stderr)
        srv.serve_forever()
