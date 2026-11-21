// Zero-dependency Node.js HTTP server for LAN live preview
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3456;
const HOST = "0.0.0.0";
const ROOT_DIR = path.resolve(__dirname, "../..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/" || reqPath === "/index.html") {
    reqPath = "/test/preview/index.html";
  }

  // Intercept popup-frame.html to inject mock scripts seamlessly
  if (reqPath === "/popup-frame.html") {
    const popupHtmlPath = path.join(ROOT_DIR, "popup.html");
    fs.readFile(popupHtmlPath, "utf8", (err, html) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error loading popup.html");
        return;
      }

      // Inject mock scripts right before popup.js
      const injectedHtml = html.replace(
        '<script src="popup.js"></script>',
        `<script src="/test/preview/mock-data.js"></script>
    <script src="/test/preview/mock-chrome.js"></script>
    <script src="/popup.js"></script>`
      );

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(injectedHtml);
    });
    return;
  }

  // Standard static file serving
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  // Security guard: ensure within ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found: " + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[Sanctum Preview] Server running on http://${HOST}:${PORT}`);
  console.log(`[Sanctum Preview] Access locally on your network at http://192.168.1.55:${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
