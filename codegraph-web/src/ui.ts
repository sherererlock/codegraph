/**
 * UI controls for CodeGraph web visualization
 */

import * as api from './api';
import { GraphManager } from './graph';

export class UIController {
  private graph: GraphManager;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private contextMenu: HTMLElement | null = null;

  constructor(graph: GraphManager) {
    this.graph = graph;
    this.init();
  }

  private init(): void {
    this.setupSearch();
    this.setupViewMode();
    this.setupLayout();
    this.setupFilters();
    this.loadStats();
  }

  // ---- Stats ----

  private async loadStats(): Promise<void> {
    try {
      const stats = await api.getStatus();
      const badge = document.getElementById('stats-badge')!;
      badge.textContent = `${stats.nodeCount} nodes, ${stats.edgeCount} edges, ${stats.fileCount} files`;
    } catch (err) {
      const badge = document.getElementById('stats-badge')!;
      badge.textContent = 'Not connected';
      badge.style.color = '#f85149';
    }
  }

  // ---- Search ----

  private setupSearch(): void {
    const input = document.getElementById('search-input') as HTMLInputElement;
    const resultsDiv = document.getElementById('search-results')!;

    input.addEventListener('input', () => {
      if (this.searchTimeout) clearTimeout(this.searchTimeout);
      const query = input.value.trim();
      if (query.length < 2) {
        resultsDiv.classList.remove('active');
        return;
      }
      this.searchTimeout = setTimeout(() => this.doSearch(query), 250);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        resultsDiv.classList.remove('active');
        input.blur();
      }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target || !(e.target as HTMLElement).closest('.search-container')) {
        resultsDiv.classList.remove('active');
      }
    });
  }

  private async doSearch(query: string): Promise<void> {
    const resultsDiv = document.getElementById('search-results')!;
    try {
      const results = await api.search(query, undefined, 15);
      if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="search-result-item" style="color: #8b949e">No results found</div>';
        resultsDiv.classList.add('active');
        return;
      }

      resultsDiv.innerHTML = results.map((r) => {
        const kindColor = this.getKindColor(r.node.kind);
        return `
          <div class="search-result-item" data-id="${this.escapeHtml(r.node.id)}" data-name="${this.escapeHtml(r.node.name)}">
            <span class="kind-badge" style="background: ${kindColor}20; color: ${kindColor}">${r.node.kind}</span>
            <span class="name">${this.escapeHtml(r.node.name)}</span>
            <div class="meta">${this.escapeHtml(r.node.filePath)}:${r.node.startLine}</div>
          </div>
        `;
      }).join('');

      // Add click handlers
      resultsDiv.querySelectorAll('.search-result-item').forEach((item) => {
        item.addEventListener('click', () => {
          const nodeId = (item as HTMLElement).dataset.id!;
          const nodeName = (item as HTMLElement).dataset.name!;
          resultsDiv.classList.remove('active');
          this.loadNodeContext(nodeId);
          this.graph.highlightNode(nodeId);
        });
      });

      resultsDiv.classList.add('active');
    } catch (err) {
      resultsDiv.innerHTML = `<div class="search-result-item" style="color: #f85149">Error: ${err instanceof Error ? err.message : String(err)}</div>`;
      resultsDiv.classList.add('active');
    }
  }

  // ---- View Mode ----

  private setupViewMode(): void {
    const select = document.getElementById('view-mode') as HTMLSelectElement;
    select.addEventListener('change', async () => {
      const mode = select.value;
      switch (mode) {
        case 'all':
          await this.loadOverview();
          break;
        case 'files':
          await this.loadFileDeps();
          break;
      }
    });
  }

  async loadOverview(): Promise<void> {
    const info = document.getElementById('graph-info')!;
    info.textContent = 'Loading graph...';
    try {
      const subgraph = await api.getAllGraph(
        ['class', 'interface', 'struct', 'function', 'method', 'component', 'route'],
        300
      );
      this.graph.loadSubgraph(subgraph);
      this.updateFilters();
      const stats = this.graph.getVisibleStats();
      info.textContent = `${stats.nodes} nodes, ${stats.edges} edges`;
    } catch (err) {
      info.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async loadFileDeps(): Promise<void> {
    const info = document.getElementById('graph-info')!;
    info.textContent = 'Loading file dependencies...';
    try {
      const subgraph = await api.getAllGraph(['file'], 500);
      // Replace file nodes with import edges
      const files = await api.getAllFiles();
      const allDeps: api.GraphEdge[] = [];
      const nodeIds = new Set(subgraph.nodes.map((n) => n.id));

      for (const file of files.slice(0, 100)) {
        try {
          const deps = await api.getFileDeps(file.path);
          for (const dep of deps) {
            const depFile = files.find((f) => f.path === dep);
            if (depFile) {
              allDeps.push({
                source: `file:${file.path}`,
                target: `file:${dep}`,
                kind: 'imports' as api.EdgeKind,
              });
            }
          }
        } catch {
          // Skip files that fail
        }
      }

      const fileSubgraph: api.Subgraph = {
        nodes: files.slice(0, 100).map((f) => ({
          id: `file:${f.path}`,
          kind: 'file' as api.NodeKind,
          name: f.path.split('/').pop() || f.path,
          qualifiedName: f.path,
          filePath: f.path,
          language: f.language,
          startLine: 0,
          endLine: 0,
        })),
        edges: allDeps,
        roots: [],
      };

      this.graph.loadSubgraph(fileSubgraph);
      this.updateFilters();
      const stats = this.graph.getVisibleStats();
      info.textContent = `${stats.nodes} files, ${stats.edges} dependencies`;
    } catch (err) {
      info.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ---- Layout ----

  private setupLayout(): void {
    const btn = document.getElementById('layout-btn')!;
    const select = document.getElementById('layout-select') as HTMLSelectElement;

    btn.addEventListener('click', () => {
      this.graph.runLayout(select.value);
    });
  }

  // ---- Filters ----

  private setupFilters(): void {
    // Will be populated after graph loads
  }

  private updateFilters(): void {
    const nodeKindsDiv = document.getElementById('node-kind-filters')!;
    const edgeKindsDiv = document.getElementById('edge-kind-filters')!;

    const nodeKinds = this.graph.getNodeKinds();
    const edgeKinds = this.graph.getEdgeKinds();

    nodeKindsDiv.innerHTML = nodeKinds.map((kind) => {
      const color = this.getKindColor(kind);
      return `
        <label>
          <input type="checkbox" value="${kind}" checked data-filter="node" />
          <span style="color: ${color}">${kind}</span>
        </label>
      `;
    }).join('');

    edgeKindsDiv.innerHTML = edgeKinds.map((kind) => {
      return `
        <label>
          <input type="checkbox" value="${kind}" checked data-filter="edge" />
          ${kind}
        </label>
      `;
    }).join('');

    // Add change handlers
    nodeKindsDiv.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', () => this.applyFilters());
    });
    edgeKindsDiv.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', () => this.applyFilters());
    });
  }

  private applyFilters(): void {
    const nodeKindsDiv = document.getElementById('node-kind-filters')!;
    const edgeKindsDiv = document.getElementById('edge-kind-filters')!;

    const uncheckedNodeKinds = new Set<string>();
    nodeKindsDiv.querySelectorAll('input:not(:checked)').forEach((cb) => {
      uncheckedNodeKinds.add((cb as HTMLInputElement).value);
    });

    const uncheckedEdgeKinds = new Set<string>();
    edgeKindsDiv.querySelectorAll('input:not(:checked)').forEach((cb) => {
      uncheckedEdgeKinds.add((cb as HTMLInputElement).value);
    });

    // Filter nodes: hide unchecked kinds
    const activeNodeKinds = new Set(this.graph.getNodeKinds().filter((k) => !uncheckedNodeKinds.has(k)));
    this.graph.filterByNodeKinds(activeNodeKinds);

    // Filter edges
    const activeEdgeKinds = new Set(this.graph.getEdgeKinds().filter((k) => !uncheckedEdgeKinds.has(k)));
    this.graph.filterByEdgeKinds(activeEdgeKinds);

    // Update info
    const stats = this.graph.getVisibleStats();
    const info = document.getElementById('graph-info')!;
    info.textContent = `${stats.nodes} nodes, ${stats.edges} edges`;
  }

  // ---- Node Detail ----

  async loadNodeContext(nodeId: string): Promise<void> {
    const detailPanel = document.getElementById('node-detail')!;
    const detailContent = document.getElementById('node-detail-content')!;
    const contextPanel = document.getElementById('context-panel')!;
    const contextContent = document.getElementById('context-content')!;

    detailPanel.style.display = 'block';
    detailContent.innerHTML = '<div style="color: #8b949e">Loading...</div>';

    try {
      const [node, callers, callees] = await Promise.all([
        api.getNode(nodeId),
        api.getNodeCallers(nodeId, 10),
        api.getNodeCallees(nodeId, 10),
      ]);

      detailContent.innerHTML = `
        <div class="detail-row">
          <div class="label">Name</div>
          <div class="value" style="color: ${this.getKindColor(node.kind)}">${this.escapeHtml(node.name)}</div>
        </div>
        <div class="detail-row">
          <div class="label">Kind</div>
          <div class="value">${node.kind}</div>
        </div>
        <div class="detail-row">
          <div class="label">File</div>
          <div class="value">${this.escapeHtml(node.filePath)}:${node.startLine}</div>
        </div>
        ${node.signature ? `
          <div class="detail-row">
            <div class="label">Signature</div>
            <div class="value" style="font-family: monospace; font-size: 11px">${this.escapeHtml(node.signature)}</div>
          </div>
        ` : ''}
        ${node.language ? `
          <div class="detail-row">
            <div class="label">Language</div>
            <div class="value">${node.language}</div>
          </div>
        ` : ''}
        ${callers.length > 0 ? `
          <div class="detail-section">
            <h4>Callers (${callers.length})</h4>
            <ul>
              ${callers.map((c) => `
                <li data-id="${c.node.id}" class="nav-link">
                  ${this.escapeHtml(c.node.name)} <span style="color: #6e7681">${c.node.kind}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        ${callees.length > 0 ? `
          <div class="detail-section">
            <h4>Callees (${callees.length})</h4>
            <ul>
              ${callees.map((c) => `
                <li data-id="${c.node.id}" class="nav-link">
                  ${this.escapeHtml(c.node.name)} <span style="color: #6e7681">${c.node.kind}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      `;

      // Add click handlers for caller/callee links
      detailContent.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          const targetId = (link as HTMLElement).dataset.id!;
          this.loadNodeContext(targetId);
          this.graph.highlightNode(targetId);
        });
      });

      // Load context
      try {
        const context = await api.getNodeContext(nodeId);
        contextPanel.style.display = 'block';
        contextContent.innerHTML = this.renderContext(context);
      } catch {
        contextPanel.style.display = 'none';
      }
    } catch (err) {
      detailContent.innerHTML = `<div style="color: #f85149">Error: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  }

  private renderContext(context: api.Context): string {
    const sections: string[] = [];

    if (context.ancestors.length > 0) {
      sections.push(`
        <div class="detail-section">
          <h4>Ancestors</h4>
          <ul>
            ${context.ancestors.map((a) => `
              <li data-id="${a.id}" class="nav-link">
                ${this.escapeHtml(a.name)} <span style="color: #6e7681">${a.kind}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `);
    }

    if (context.children.length > 0) {
      sections.push(`
        <div class="detail-section">
          <h4>Children (${context.children.length})</h4>
          <ul>
            ${context.children.slice(0, 20).map((c) => `
              <li data-id="${c.id}" class="nav-link">
                ${this.escapeHtml(c.name)} <span style="color: #6e7681">${c.kind}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `);
    }

    if (context.incomingRefs.length > 0) {
      sections.push(`
        <div class="detail-section">
          <h4>Incoming References (${context.incomingRefs.length})</h4>
          <ul>
            ${context.incomingRefs.slice(0, 20).map((r) => `
              <li data-id="${r.node.id}" class="nav-link">
                ${this.escapeHtml(r.node.name)} <span style="color: #6e7681">${r.edge.kind}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `);
    }

    if (context.outgoingRefs.length > 0) {
      sections.push(`
        <div class="detail-section">
          <h4>Outgoing References (${context.outgoingRefs.length})</h4>
          <ul>
            ${context.outgoingRefs.slice(0, 20).map((r) => `
              <li data-id="${r.node.id}" class="nav-link">
                ${this.escapeHtml(r.node.name)} <span style="color: #6e7681">${r.edge.kind}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `);
    }

    // Add click handlers after rendering
    setTimeout(() => {
      document.querySelectorAll('#context-content .nav-link').forEach((link) => {
        link.addEventListener('click', () => {
          const targetId = (link as HTMLElement).dataset.id!;
          this.loadNodeContext(targetId);
          this.graph.highlightNode(targetId);
        });
      });
    }, 0);

    return sections.join('') || '<div style="color: #8b949e">No context available</div>';
  }

  // ---- Context Menu ----

  showContextMenu(nodeId: string, x: number, y: number): void {
    this.hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const items = [
      { label: 'Show Call Graph', action: () => this.loadCallGraph(nodeId) },
      { label: 'Show Impact', action: () => this.loadImpact(nodeId) },
      { label: 'Show Type Hierarchy', action: () => this.loadHierarchy(nodeId) },
      { label: 'Expand Neighbors', action: () => this.expandNode(nodeId) },
      { label: 'View Details', action: () => this.loadNodeContext(nodeId) },
    ];

    menu.innerHTML = items.map((item) => `
      <div class="context-menu-item">${item.label}</div>
    `).join('');

    items.forEach((item, i) => {
      (menu.children[i] as HTMLElement).addEventListener('click', () => {
        this.hideContextMenu();
        item.action();
      });
    });

    document.body.appendChild(menu);
    this.contextMenu = menu;

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', this.hideContextMenuHandler);
    }, 0);
  }

  hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
    document.removeEventListener('click', this.hideContextMenuHandler);
  }

  private hideContextMenuHandler = () => this.hideContextMenu();

  // ---- Graph Actions ----

  private async loadCallGraph(nodeId: string): Promise<void> {
    const info = document.getElementById('graph-info')!;
    info.textContent = 'Loading call graph...';
    try {
      const subgraph = await api.getNodeCallGraph(nodeId, 2);
      this.graph.loadSubgraph(subgraph);
      this.updateFilters();
      const stats = this.graph.getVisibleStats();
      info.textContent = `Call graph: ${stats.nodes} nodes, ${stats.edges} edges`;
    } catch (err) {
      info.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async loadImpact(nodeId: string): Promise<void> {
    const info = document.getElementById('graph-info')!;
    info.textContent = 'Loading impact...';
    try {
      const subgraph = await api.getNodeImpact(nodeId, 3);
      this.graph.loadSubgraph(subgraph);
      this.updateFilters();
      const stats = this.graph.getVisibleStats();
      info.textContent = `Impact: ${stats.nodes} nodes affected`;
    } catch (err) {
      info.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async loadHierarchy(nodeId: string): Promise<void> {
    const info = document.getElementById('graph-info')!;
    info.textContent = 'Loading hierarchy...';
    try {
      const subgraph = await api.getNodeHierarchy(nodeId);
      this.graph.loadSubgraph(subgraph);
      this.updateFilters();
      const stats = this.graph.getVisibleStats();
      info.textContent = `Hierarchy: ${stats.nodes} types`;
    } catch (err) {
      info.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async expandNode(nodeId: string): Promise<void> {
    try {
      const subgraph = await api.traverseGraph(nodeId, {
        maxDepth: 1,
        direction: 'both',
        limit: 50,
      });
      this.graph.addSubgraph(subgraph);
      this.updateFilters();
    } catch (err) {
      // Silently fail
    }
  }

  // ---- Helpers ----

  private getKindColor(kind: string): string {
    const colors: Record<string, string> = {
      file: '#8b949e',
      class: '#3fb950',
      interface: '#bc8cff',
      function: '#58a6ff',
      method: '#58a6ff',
      variable: '#d29922',
      constant: '#d29922',
      enum: '#f778ba',
      route: '#39d2c0',
      component: '#39d2c0',
    };
    return colors[kind] || '#8b949e';
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
