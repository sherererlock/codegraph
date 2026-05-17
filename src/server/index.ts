/**
 * CodeGraph HTTP API Server
 *
 * Lightweight REST server exposing graph data as JSON endpoints.
 * Uses Node.js built-in http module — zero new dependencies.
 */

import * as http from 'http';
import * as url from 'url';
import CodeGraph, { findNearestCodeGraphRoot } from '../index';
import type { Node, Edge, Subgraph, NodeKind } from '../types';
import { serveStatic } from './static';

/** Serialized subgraph (Map converted to array) */
interface SerializedSubgraph {
  nodes: Node[];
  edges: Edge[];
  roots: string[];
}

/** Options for the web server */
export interface WebServerOptions {
  port: number;
  host: string;
  projectPath?: string;
  /** Path to built frontend files for static serving */
  staticDir?: string;
}

/**
 * Serialize a Subgraph for JSON response.
 * Converts the Map<string, Node> to an array.
 */
function serializeSubgraph(subgraph: Subgraph): SerializedSubgraph {
  return {
    nodes: Array.from(subgraph.nodes.values()),
    edges: subgraph.edges,
    roots: subgraph.roots,
  };
}

/**
 * Extract path segments from URL.
 * E.g., "/api/node/abc123/callers" → ["api", "node", "abc123", "callers"]
 */
function getPathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/**
 * Safely get a segment by index
 */
function seg(segments: string[], index: number): string | undefined {
  return segments[index];
}

/**
 * Set CORS headers for local development
 */
function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Send a JSON response
 */
function sendJson(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send an error response
 */
function sendError(res: http.ServerResponse, message: string, status = 400): void {
  sendJson(res, { error: message }, status);
}

/**
 * Parse query parameters from URL
 */
function parseQuery(parsed: url.UrlWithStringQuery): Record<string, string> {
  const query: Record<string, string> = {};
  if (parsed.query) {
    const params = new URLSearchParams(parsed.query);
    params.forEach((value, key) => {
      query[key] = value;
    });
  }
  return query;
}

/**
 * Create and start the HTTP API server
 */
export function createWebServer(options: WebServerOptions): http.Server {
  const { projectPath, staticDir } = options;

  // Resolve the CodeGraph project
  let cg: CodeGraph | null = null;

  const resolvedRoot = projectPath
    ? findNearestCodeGraphRoot(projectPath)
    : findNearestCodeGraphRoot(process.cwd());

  if (resolvedRoot) {
    try {
      cg = CodeGraph.openSync(resolvedRoot);
    } catch (err) {
      process.stderr.write(
        `[CodeGraph Web] Failed to open project: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Only GET requests
    if (req.method !== 'GET') {
      sendError(res, 'Method not allowed', 405);
      return;
    }

    const parsed = url.parse(req.url || '');
    const segments = getPathSegments(parsed.pathname || '');
    const query = parseQuery(parsed);
    const s = (i: number) => seg(segments, i);

    // Not initialized check for API routes
    if (s(0) === 'api' && !cg) {
      sendError(res, 'CodeGraph not initialized. Run "codegraph init" first.', 503);
      return;
    }

    try {
      // Route: /api/status
      if (s(0) === 'api' && s(1) === 'status' && segments.length === 2) {
        const stats = cg!.getStats();
        const backend = cg!.getBackend();
        sendJson(res, { ...stats, backend, projectRoot: resolvedRoot });
        return;
      }

      // Route: /api/search?q=...&kind=...&limit=10
      if (s(0) === 'api' && s(1) === 'search' && segments.length === 2) {
        const q = query.q;
        if (!q) {
          sendError(res, 'Missing required query parameter: q');
          return;
        }
        const kind = query.kind as NodeKind | undefined;
        const limit = parseInt(query.limit || '10', 10);
        const results = cg!.searchNodes(q, {
          limit: Math.min(limit, 100),
          kinds: kind ? [kind] : undefined,
        });
        sendJson(res, results);
        return;
      }

      // Route: /api/node/:id
      if (s(0) === 'api' && s(1) === 'node' && segments.length === 3 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const node = cg!.getNode(nodeId);
        if (!node) {
          sendError(res, 'Node not found', 404);
          return;
        }
        sendJson(res, node);
        return;
      }

      // Route: /api/node/:id/context
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'context' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        try {
          const context = cg!.getContext(nodeId);
          sendJson(res, context);
        } catch {
          sendError(res, 'Node not found', 404);
        }
        return;
      }

      // Route: /api/node/:id/callers
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'callers' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const limit = parseInt(query.limit || '20', 10);
        const callers = cg!.getCallers(nodeId).slice(0, limit);
        sendJson(res, callers);
        return;
      }

      // Route: /api/node/:id/callees
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'callees' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const limit = parseInt(query.limit || '20', 10);
        const callees = cg!.getCallees(nodeId).slice(0, limit);
        sendJson(res, callees);
        return;
      }

      // Route: /api/node/:id/impact?depth=3
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'impact' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const depth = parseInt(query.depth || '3', 10);
        const impact = cg!.getImpactRadius(nodeId, Math.min(depth, 10));
        sendJson(res, serializeSubgraph(impact));
        return;
      }

      // Route: /api/node/:id/callgraph?depth=2
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'callgraph' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const depth = parseInt(query.depth || '2', 10);
        const callGraph = cg!.getCallGraph(nodeId, Math.min(depth, 5));
        sendJson(res, serializeSubgraph(callGraph));
        return;
      }

      // Route: /api/node/:id/hierarchy
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'hierarchy' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const hierarchy = cg!.getTypeHierarchy(nodeId);
        sendJson(res, serializeSubgraph(hierarchy));
        return;
      }

      // Route: /api/node/:id/code
      if (s(0) === 'api' && s(1) === 'node' && s(3) === 'code' && segments.length === 4 && s(2)) {
        const nodeId = decodeURIComponent(s(2)!);
        const code = await cg!.getCode(nodeId);
        sendJson(res, { code });
        return;
      }

      // Route: /api/files
      if (s(0) === 'api' && s(1) === 'files' && segments.length === 2) {
        const files = cg!.getFiles();
        sendJson(res, files);
        return;
      }

      // Route: /api/files/:encodedPath/deps
      if (s(0) === 'api' && s(1) === 'files' && s(3) === 'deps' && segments.length === 4 && s(2)) {
        const filePath = decodeURIComponent(s(2)!);
        const deps = cg!.getFileDependencies(filePath);
        sendJson(res, deps);
        return;
      }

      // Route: /api/files/:encodedPath/dependents
      if (s(0) === 'api' && s(1) === 'files' && s(3) === 'dependents' && segments.length === 4 && s(2)) {
        const filePath = decodeURIComponent(s(2)!);
        const dependents = cg!.getFileDependents(filePath);
        sendJson(res, dependents);
        return;
      }

      // Route: /api/graph/all?nodeKinds=class,function&edgeKinds=calls,imports
      if (s(0) === 'api' && s(1) === 'graph' && s(2) === 'all' && segments.length === 3) {
        const nodeKinds = query.nodeKinds
          ? query.nodeKinds.split(',').filter(Boolean) as NodeKind[]
          : undefined;
        const limit = parseInt(query.limit || '500', 10);

        const subgraph = cg!.getFilteredSubgraph(
          (node) => {
            if (nodeKinds && nodeKinds.length > 0 && !nodeKinds.includes(node.kind)) {
              return false;
            }
            return true;
          },
          true
        );

        // Apply limit
        const limitedNodes = new Map<string, Node>();
        let count = 0;
        for (const [id, node] of subgraph.nodes) {
          if (count >= limit) break;
          limitedNodes.set(id, node);
          count++;
        }

        const limitedEdges = subgraph.edges.filter(
          (e) => limitedNodes.has(e.source) && limitedNodes.has(e.target)
        );

        sendJson(res, serializeSubgraph({
          nodes: limitedNodes,
          edges: limitedEdges,
          roots: subgraph.roots,
        }));
        return;
      }

      // Route: /api/graph/traverse/:id?maxDepth=2&direction=outgoing&edgeKinds=calls,imports
      if (s(0) === 'api' && s(1) === 'graph' && s(2) === 'traverse' && segments.length === 4 && s(3)) {
        const nodeId = decodeURIComponent(s(3)!);
        const maxDepth = parseInt(query.maxDepth || '3', 10);
        const direction = (query.direction || 'both') as 'outgoing' | 'incoming' | 'both';
        const edgeKinds = query.edgeKinds
          ? query.edgeKinds.split(',').filter(Boolean) as any[]
          : undefined;
        const limit = parseInt(query.limit || '200', 10);

        const subgraph = cg!.traverse(nodeId, {
          maxDepth: Math.min(maxDepth, 10),
          direction,
          edgeKinds,
          limit,
        });

        sendJson(res, serializeSubgraph(subgraph));
        return;
      }

      // Route: /api/resolve?q=... (find symbol and return its subgraph context)
      if (s(0) === 'api' && s(1) === 'resolve' && segments.length === 2) {
        const q = query.q;
        if (!q) {
          sendError(res, 'Missing required query parameter: q');
          return;
        }
        const results = cg!.searchNodes(q, { limit: 1 });
        if (results.length === 0) {
          sendJson(res, { found: false, query: q });
          return;
        }
        const node = results[0]!.node;
        const context = cg!.getContext(node.id);
        sendJson(res, { found: true, node, context });
        return;
      }

      // Static file serving for the frontend
      if (staticDir && s(0) !== 'api') {
        const served = await serveStatic(req, res, staticDir, parsed.pathname || '/');
        if (served) return;
      }

      // 404 for unknown routes
      sendError(res, `Not found: ${parsed.pathname}`, 404);
    } catch (err) {
      process.stderr.write(`[CodeGraph Web] Error: ${err instanceof Error ? err.message : String(err)}\n`);
      sendError(res, 'Internal server error', 500);
    }
  });

  // Cleanup on close
  server.on('close', () => {
    if (cg) {
      cg.close();
      cg = null;
    }
  });

  return server;
}

/**
 * Start the web server and listen on the specified port
 */
export async function startWebServer(options: WebServerOptions): Promise<http.Server> {
  const server = createWebServer(options);

  return new Promise((resolve, reject) => {
    server.listen(options.port, options.host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : options.port;
      const host = options.host === '0.0.0.0' ? 'localhost' : options.host;

      console.error(`\x1b[36m\x1b[1mCodeGraph Web Server\x1b[0m`);
      console.error(`\x1b[32m✓\x1b[0m API running at \x1b[4mhttp://${host}:${actualPort}/api\x1b[0m`);
      if (options.staticDir) {
        console.error(`\x1b[32m✓\x1b[0m Frontend at \x1b[4mhttp://${host}:${actualPort}/\x1b[0m`);
      }
      console.error(`\x1b[90mPress Ctrl+C to stop\x1b[0m\n`);

      resolve(server);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\x1b[31m✗\x1b[0m Port ${options.port} is already in use`);
      } else {
        console.error(`\x1b[31m✗\x1b[0m Server error: ${err.message}`);
      }
      reject(err);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.error('\nShutting down...');
      server.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      server.close();
      process.exit(0);
    });
  });
}
