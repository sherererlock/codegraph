/**
 * CodeGraph Web Visualization - Entry Point
 */

import { GraphManager } from './graph';
import { UIController } from './ui';
import type { GraphNode } from './api';

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('cy')!;
  const ui: { controller: UIController | null } = { controller: null };

  const graph = new GraphManager({
    container,

    onNodeClick: (node: GraphNode) => {
      ui.controller?.loadNodeContext(node.id);
      graph.highlightNode(node.id);
    },

    onNodeDoubleClick: (nodeId: string) => {
      // Expand node neighbors on double-click
      import('./api').then((api) => {
        api.traverseGraph(nodeId, { maxDepth: 1, direction: 'both', limit: 50 })
          .then((subgraph) => {
            graph.addSubgraph(subgraph);
            ui.controller?.['updateFilters']();
          })
          .catch(() => {});
      });
    },

    onNodeContextClick: (nodeId: string, event: MouseEvent) => {
      event.preventDefault();
      ui.controller?.showContextMenu(nodeId, event.clientX, event.clientY);
    },
  });

  ui.controller = new UIController(graph);

  // Load initial overview
  ui.controller.loadOverview();

  // Fit button (using keyboard shortcut)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !(e.target as HTMLElement).matches('input, textarea, select')) {
      graph.fit();
    }
    if (e.key === 'Escape') {
      graph.clearHighlights();
      ui.controller?.hideContextMenu();
    }
  });
});
