/**
 * Static file server for the CodeGraph web frontend.
 * Serves built frontend files from a directory.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

/** MIME types for common file extensions */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Serve a static file if it exists in the static directory.
 * Returns true if a file was served, false otherwise.
 */
export async function serveStatic(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  staticDir: string,
  pathname: string
): Promise<boolean> {
  // Sanitize the path — prevent directory traversal
  const safePath = pathname
    .replace(/\.\./g, '')
    .replace(/\/+/g, '/');

  // Try exact file first
  let filePath = path.join(staticDir, safePath);

  // If it's a directory, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // If file doesn't exist, try index.html (SPA fallback)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(staticDir, 'index.html');
  }

  // If still doesn't exist, give up
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    return new Promise((resolve) => {
      stream.on('end', () => resolve(true));
      stream.on('error', () => {
        res.writeHead(500);
        res.end('Internal server error');
        resolve(true);
      });
    });
  } catch {
    return false;
  }
}
