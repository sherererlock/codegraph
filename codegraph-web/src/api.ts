/**
 * CodeGraph REST API Client
 */

const BASE_URL = '/api';

// ---- Types (mirrors of CodeGraph types) ----

export type NodeKind =
  | 'file' | 'module' | 'class' | 'struct' | 'interface' | 'trait'
  | 'protocol' | 'function' | 'method' | 'property' | 'field'
  | 'variable' | 'constant' | 'enum' | 'enum_member' | 'type_alias'
  | 'namespace' | 'parameter' | 'import' | 'export' | 'route' | 'component';

export type EdgeKind =
  | 'contains' | 'calls' | 'imports' | 'exports' | 'extends'
  | 'implements' | 'references' | 'type_of' | 'returns'
  | 'instantiates' | 'overrides' | 'decorates';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docstring?: string;
  visibility?: string;
  isExported?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  line?: number;
}

export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  roots: string[];
}

export interface SearchResult {
  node: GraphNode;
  score: number;
  highlights?: string[];
}

export interface Context {
  focal: GraphNode;
  ancestors: GraphNode[];
  children: GraphNode[];
  incomingRefs: Array<{ node: GraphNode; edge: GraphEdge }>;
  outgoingRefs: Array<{ node: GraphNode; edge: GraphEdge }>;
  types: GraphNode[];
  imports: GraphNode[];
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  nodesByKind: Record<string, number>;
  edgesByKind: Record<string, number>;
  filesByLanguage: Record<string, number>;
  dbSizeBytes: number;
  backend: string;
  projectRoot: string;
}

export interface FileRecord {
  path: string;
  language: string;
  nodeCount: number;
  size: number;
}

// ---- API Functions ----

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getStatus(): Promise<GraphStats> {
  return get<GraphStats>('/status');
}

export async function search(query: string, kind?: string, limit = 10): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (kind) params.set('kind', kind);
  return get<SearchResult[]>(`/search?${params}`);
}

export async function getNode(id: string): Promise<GraphNode> {
  return get<GraphNode>(`/node/${encodeURIComponent(id)}`);
}

export async function getNodeContext(id: string): Promise<Context> {
  return get<Context>(`/node/${encodeURIComponent(id)}/context`);
}

export async function getNodeCallers(id: string, limit = 20): Promise<Array<{ node: GraphNode; edge: GraphEdge }>> {
  return get(`/node/${encodeURIComponent(id)}/callers?limit=${limit}`);
}

export async function getNodeCallees(id: string, limit = 20): Promise<Array<{ node: GraphNode; edge: GraphEdge }>> {
  return get(`/node/${encodeURIComponent(id)}/callees?limit=${limit}`);
}

export async function getNodeImpact(id: string, depth = 3): Promise<Subgraph> {
  return get<Subgraph>(`/node/${encodeURIComponent(id)}/impact?depth=${depth}`);
}

export async function getNodeCallGraph(id: string, depth = 2): Promise<Subgraph> {
  return get<Subgraph>(`/node/${encodeURIComponent(id)}/callgraph?depth=${depth}`);
}

export async function getNodeHierarchy(id: string): Promise<Subgraph> {
  return get<Subgraph>(`/node/${encodeURIComponent(id)}/hierarchy`);
}

export async function getNodeCode(id: string): Promise<{ code: string | null }> {
  return get(`/node/${encodeURIComponent(id)}/code`);
}

export async function getAllFiles(): Promise<FileRecord[]> {
  return get<FileRecord[]>('/files');
}

export async function getFileDeps(filePath: string): Promise<string[]> {
  return get<string[]>(`/files/${encodeURIComponent(filePath)}/deps`);
}

export async function getFileDependents(filePath: string): Promise<string[]> {
  return get<string[]>(`/files/${encodeURIComponent(filePath)}/dependents`);
}

export async function getAllGraph(nodeKinds?: string[], limit = 500): Promise<Subgraph> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (nodeKinds && nodeKinds.length > 0) params.set('nodeKinds', nodeKinds.join(','));
  return get<Subgraph>(`/graph/all?${params}`);
}

export async function traverseGraph(
  nodeId: string,
  options: { maxDepth?: number; direction?: string; edgeKinds?: string[]; limit?: number } = {}
): Promise<Subgraph> {
  const params = new URLSearchParams();
  if (options.maxDepth) params.set('maxDepth', String(options.maxDepth));
  if (options.direction) params.set('direction', options.direction);
  if (options.edgeKinds) params.set('edgeKinds', options.edgeKinds.join(','));
  if (options.limit) params.set('limit', String(options.limit));
  return get<Subgraph>(`/graph/traverse/${encodeURIComponent(nodeId)}?${params}`);
}

export async function resolveSymbol(query: string): Promise<{ found: boolean; node?: GraphNode; context?: Context }> {
  return get(`/resolve?q=${encodeURIComponent(query)}`);
}
