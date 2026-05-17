/**
 * Cytoscape graph manager for CodeGraph visualization
 */

import cytoscape from 'cytoscape';
import type { GraphNode, GraphEdge, Subgraph, NodeKind, EdgeKind } from './api';

// Node kind colors
const NODE_COLORS: Record<string, string> = {
  file: '#8b949e',
  module: '#8b949e',
  class: '#3fb950',
  struct: '#3fb950',
  interface: '#bc8cff',
  trait: '#bc8cff',
  protocol: '#bc8cff',
  function: '#58a6ff',
  method: '#58a6ff',
  property: '#d2a8ff',
  field: '#d2a8ff',
  variable: '#d29922',
  constant: '#d29922',
  enum: '#f778ba',
  enum_member: '#f778ba',
  type_alias: '#bc8cff',
  namespace: '#8b949e',
  parameter: '#6e7681',
  import: '#6e7681',
  export: '#6e7681',
  route: '#39d2c0',
  component: '#39d2c0',
};

// Node kind shapes
const NODE_SHAPES: Record<string, string> = {
  file: 'round-rectangle',
  module: 'round-rectangle',
  class: 'round-rectangle',
  struct: 'round-rectangle',
  interface: 'round-rectangle',
  trait: 'round-rectangle',
  protocol: 'round-rectangle',
  function: 'ellipse',
  method: 'ellipse',
  property: 'diamond',
  field: 'diamond',
  variable: 'ellipse',
  constant: 'ellipse',
  enum: 'round-rectangle',
  enum_member: 'ellipse',
  type_alias: 'round-rectangle',
  namespace: 'round-rectangle',
  parameter: 'ellipse',
  import: 'vee',
  export: 'vee',
  route: 'octagon',
  component: 'hexagon',
};

// Edge kind styles
const EDGE_STYLES: Record<string, { color: string; style: string; arrow: string }> = {
  contains: { color: '#30363d', style: 'solid', arrow: 'triangle' },
  calls: { color: '#58a6ff', style: 'solid', arrow: 'triangle' },
  imports: { color: '#8b949e', style: 'dashed', arrow: 'triangle' },
  exports: { color: '#3fb950', style: 'dashed', arrow: 'triangle' },
  extends: { color: '#3fb950', style: 'solid', arrow: 'triangle' },
  implements: { color: '#bc8cff', style: 'dashed', arrow: 'triangle' },
  references: { color: '#6e7681', style: 'dotted', arrow: 'none' },
  type_of: { color: '#d29922', style: 'dotted', arrow: 'none' },
  returns: { color: '#d29922', style: 'dotted', arrow: 'triangle' },
  instantiates: { color: '#f778ba', style: 'solid', arrow: 'triangle' },
  overrides: { color: '#f778ba', style: 'dashed', arrow: 'triangle' },
  decorates: { color: '#39d2c0', style: 'dashed', arrow: 'none' },
};

export interface GraphManagerOptions {
  container: HTMLElement;
  onNodeClick?: (node: GraphNode) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onNodeContextClick?: (nodeId: string, event: MouseEvent) => void;
  onEdgeClick?: (edge: GraphEdge) => void;
}

export class GraphManager {
  private cy: cytoscape.Core;
  private nodeMap = new Map<string, GraphNode>();

  constructor(options: GraphManagerOptions) {
    this.cy = cytoscape({
      container: options.container,
      style: this.getCytoscapeStyle(),
      layout: { name: 'preset' },
      wheelSensitivity: 0.3,
      minZoom: 0.1,
      maxZoom: 5,
    });

    // Click handler
    this.cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      const node = this.nodeMap.get(nodeId);
      if (node && options.onNodeClick) {
        options.onNodeClick(node);
      }
    });

    // Double-click handler
    this.cy.on('dbltap', 'node', (evt) => {
      const nodeId = evt.target.id();
      if (options.onNodeDoubleClick) {
        options.onNodeDoubleClick(nodeId);
      }
    });

    // Right-click handler
    this.cy.on('cxttap', 'node', (evt) => {
      const nodeId = evt.target.id();
      if (options.onNodeContextClick) {
        const originalEvent = evt.originalEvent as MouseEvent;
        options.onNodeContextClick(nodeId, originalEvent);
      }
    });

    // Edge click handler
    this.cy.on('tap', 'edge', (evt) => {
      const edgeData = evt.target.data();
      if (options.onEdgeClick) {
        options.onEdgeClick({
          source: edgeData.source,
          target: edgeData.target,
          kind: edgeData.edgeKind,
        });
      }
    });
  }

  private getCytoscapeStyle(): any[] {
    return [
      // Default node style
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'background-color': (ele: any) => NODE_COLORS[ele.data('nodeKind')] || '#8b949e',
          'shape': (ele: any) => NODE_SHAPES[ele.data('nodeKind')] || 'ellipse',
          'width': (ele: any) => {
            const kind = ele.data('nodeKind');
            if (kind === 'file' || kind === 'module') return 40;
            if (kind === 'class' || kind === 'struct' || kind === 'interface' || kind === 'trait') return 35;
            return 25;
          },
          'height': (ele: any) => {
            const kind = ele.data('nodeKind');
            if (kind === 'file' || kind === 'module') return 40;
            if (kind === 'class' || kind === 'struct' || kind === 'interface' || kind === 'trait') return 35;
            return 25;
          },
          'font-size': '10px',
          'color': '#e6edf3',
          'text-valign': 'bottom',
          'text-margin-y': 5,
          'text-outline-color': '#0d1117',
          'text-outline-width': 2,
          'text-max-width': '120px',
          'text-wrap': 'ellipsis',
          'border-width': 1,
          'border-color': (ele: any) => NODE_COLORS[ele.data('nodeKind')] || '#8b949e',
          'border-opacity': 0.5,
        } as any,
      },
      // Highlighted node
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#ffffff',
          'z-index': 10,
          'font-weight': 'bold',
        } as any,
      },
      // Root node
      {
        selector: 'node.root',
        style: {
          'border-width': 3,
          'border-color': '#f85149',
          'width': 45,
          'height': 45,
        } as any,
      },
      // Faded node
      {
        selector: 'node.faded',
        style: {
          'opacity': 0.2,
        } as any,
      },
      // Default edge style
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': (ele: any) => EDGE_STYLES[ele.data('edgeKind')]?.color || '#30363d',
          'line-style': (ele: any) => EDGE_STYLES[ele.data('edgeKind')]?.style || 'solid',
          'target-arrow-color': (ele: any) => EDGE_STYLES[ele.data('edgeKind')]?.color || '#30363d',
          'target-arrow-shape': (ele: any) => EDGE_STYLES[ele.data('edgeKind')]?.arrow || 'none',
          'curve-style': 'bezier',
          'opacity': 0.6,
          'label': 'data(edgeKind)',
          'font-size': '8px',
          'color': '#6e7681',
          'text-rotation': 'autorotate',
          'text-margin-y': -8,
          'text-outline-color': '#0d1117',
          'text-outline-width': 1,
        } as any,
      },
      // Faded edge
      {
        selector: 'edge.faded',
        style: {
          'opacity': 0.1,
        } as any,
      },
      // Hidden
      {
        selector: '.hidden',
        style: {
          'display': 'none',
        } as any,
      },
    ];
  }

  /**
   * Load a subgraph into the visualization
   */
  loadSubgraph(subgraph: Subgraph, clearExisting = true): void {
    if (clearExisting) {
      this.cy.elements().remove();
      this.nodeMap.clear();
    }

    const elements: cytoscape.ElementDefinition[] = [];

    // Add nodes
    for (const node of subgraph.nodes) {
      if (this.nodeMap.has(node.id)) continue;
      this.nodeMap.set(node.id, node);
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.name,
          nodeKind: node.kind,
          nodeData: node,
        },
        classes: subgraph.roots.includes(node.id) ? 'root' : '',
      });
    }

    // Add edges
    for (const edge of subgraph.edges) {
      const edgeId = `${edge.source}-${edge.target}-${edge.kind}`;
      elements.push({
        group: 'edges',
        data: {
          id: edgeId,
          source: edge.source,
          target: edge.target,
          edgeKind: edge.kind,
        },
      });
    }

    this.cy.add(elements);
    this.runLayout();
  }

  /**
   * Add nodes and edges to an existing graph (for expanding)
   */
  addSubgraph(subgraph: Subgraph): void {
    const elements: cytoscape.ElementDefinition[] = [];

    for (const node of subgraph.nodes) {
      if (this.nodeMap.has(node.id)) continue;
      this.nodeMap.set(node.id, node);
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.name,
          nodeKind: node.kind,
          nodeData: node,
        },
      });
    }

    for (const edge of subgraph.edges) {
      const edgeId = `${edge.source}-${edge.target}-${edge.kind}`;
      if (this.cy.getElementById(edgeId).length > 0) continue;
      elements.push({
        group: 'edges',
        data: {
          id: edgeId,
          source: edge.source,
          target: edge.target,
          edgeKind: edge.kind,
        },
      });
    }

    if (elements.length > 0) {
      this.cy.add(elements);
      this.runLayout();
    }
  }

  /**
   * Highlight a specific node
   */
  highlightNode(nodeId: string): void {
    this.cy.elements().removeClass('highlighted faded');
    const node = this.cy.getElementById(nodeId);
    if (node.length === 0) return;

    node.addClass('highlighted');
    const neighbors = node.neighborhood();
    this.cy.elements().not(node).not(neighbors).addClass('faded');

    // Center on node
    this.cy.animate({
      center: { eles: node },
      zoom: 1.5,
    } as any, { duration: 300 });
  }

  /**
   * Clear all highlights
   */
  clearHighlights(): void {
    this.cy.elements().removeClass('highlighted faded');
  }

  /**
   * Apply a layout
   */
  runLayout(name = 'cose'): void {
    const layoutOptions: Record<string, any> = {
      cose: {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
        edgeElasticity: () => 100,
        gravity: 0.25,
        numIter: 500,
        padding: 30,
        randomize: false,
      },
      dagre: {
        name: 'dagre',
        animate: true,
        animationDuration: 500,
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 80,
        padding: 30,
      },
      concentric: {
        name: 'concentric',
        animate: true,
        animationDuration: 500,
        concentric: (node: any) => {
          const kind = node.data('nodeKind');
          if (kind === 'file' || kind === 'module') return 3;
          if (kind === 'class' || kind === 'interface') return 2;
          return 1;
        },
        levelWidth: () => 2,
        padding: 30,
      },
      circle: {
        name: 'circle',
        animate: true,
        animationDuration: 500,
        padding: 30,
      },
      grid: {
        name: 'grid',
        animate: true,
        animationDuration: 500,
        padding: 30,
      },
    };

    const options = layoutOptions[name] || layoutOptions.cose;
    this.cy.layout(options).run();
  }

  /**
   * Fit the graph to the viewport
   */
  fit(): void {
    this.cy.fit(undefined, 30);
  }

  /**
   * Filter nodes by kind
   */
  filterByNodeKinds(kinds: Set<string>): void {
    this.cy.nodes().forEach((node) => {
      const kind = node.data('nodeKind');
      if (kinds.size === 0 || kinds.has(kind)) {
        node.removeClass('hidden');
      } else {
        node.addClass('hidden');
      }
    });
    // Hide edges connected to hidden nodes
    this.cy.edges().forEach((edge) => {
      const source = edge.source();
      const target = edge.target();
      if (source.hasClass('hidden') || target.hasClass('hidden')) {
        edge.addClass('hidden');
      } else {
        edge.removeClass('hidden');
      }
    });
  }

  /**
   * Filter edges by kind
   */
  filterByEdgeKinds(kinds: Set<string>): void {
    this.cy.edges().forEach((edge) => {
      const kind = edge.data('edgeKind');
      if (kinds.size === 0 || kinds.has(kind)) {
        edge.removeClass('hidden');
      } else {
        edge.addClass('hidden');
      }
    });
  }

  /**
   * Get all node kinds present in the graph
   */
  getNodeKinds(): string[] {
    const kinds = new Set<string>();
    this.cy.nodes().forEach((node) => { kinds.add(node.data('nodeKind')); });
    return Array.from(kinds).sort();
  }

  /**
   * Get all edge kinds present in the graph
   */
  getEdgeKinds(): string[] {
    const kinds = new Set<string>();
    this.cy.edges().forEach((edge) => { kinds.add(edge.data('edgeKind')); });
    return Array.from(kinds).sort();
  }

  /**
   * Get the number of visible nodes and edges
   */
  getVisibleStats(): { nodes: number; edges: number } {
    return {
      nodes: this.cy.nodes().not('.hidden').length,
      edges: this.cy.edges().not('.hidden').length,
    };
  }

  /**
   * Get the underlying node data for an ID
   */
  getNodeData(nodeId: string): GraphNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  /**
   * Destroy the Cytoscape instance
   */
  destroy(): void {
    this.cy.destroy();
  }
}
