import { Buffer } from "node:buffer";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const BUILD_DIR = resolve(process.cwd(), "build");
const HOST = process.env.ROAM_DEV_HOST || "127.0.0.1";
const PORT = Number(process.env.ROAM_DEV_PORT || 8765);

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const FALLBACK_FILES = {
  "CHANGELOG.md": "# Changelog\n\nLocal development build for manual browser testing.\n",
  "extension.css": "/* Local development build for manual browser testing. */\n",
  "README.md": "# Roam GTD\n\nLocal development build for the Roam GTD extension.\n",
};

const send = (res, statusCode, body, contentType) => {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": contentType,
  });
  res.end(body);
};

const notFound = (res) => {
  send(res, 404, "Not found\n", "text/plain; charset=utf-8");
};

const server = createServer(async (req, res) => {
  if (!req.url) {
    notFound(res);
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, CORS_HEADERS);
    res.end();
    return;
  }

  const pathname = new URL(req.url, `http://${HOST}:${PORT}`).pathname;
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^\/+/, "");

  if (relativePath === "") {
    send(res, 200, "Roam GTD local dev server\n", "text/plain; charset=utf-8");
    return;
  }

  if (relativePath in FALLBACK_FILES) {
    const body = FALLBACK_FILES[relativePath];
    res.writeHead(200, {
      ...CORS_HEADERS,
      "Content-Length": Buffer.byteLength(body),
      "Content-Type": CONTENT_TYPES[extname(relativePath)] || "text/plain; charset=utf-8",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
    return;
  }

  const filePath = resolve(BUILD_DIR, relativePath);
  if (filePath !== BUILD_DIR && !filePath.startsWith(`${BUILD_DIR}${sep}`)) {
    notFound(res);
    return;
  }

  if (!existsSync(filePath)) {
    notFound(res);
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    notFound(res);
    return;
  }

  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Length": fileStat.size,
    "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Roam GTD local dev server: http://${HOST}:${PORT}/\n`);
  process.stdout.write(`Serving build output from ${BUILD_DIR}\n`);
});
