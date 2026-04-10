/**
 * Skyplayr Shadow DOM Walker Utility
 *
 * Provides utilities for traversing Shadow DOM trees and iframe documents.
 * Essential for finding video elements in complex web applications that use
 * Shadow DOM (like Netflix) or nested iframe structures.
 *
 * This module recursively walks through:
 * - Shadow DOM roots within the main document
 * - Nested shadow roots within shadow trees
 * - iframe documents (same-origin only)
 *
 * @fileoverview Shadow DOM traversal utilities for video element discovery
 */

(function shadowWalkerModule() {
  /**
   * Namespace for global exposure of the shadow walker API
   */
  const NAMESPACE = "SkyplayrShadowWalker";

  /**
   * Collects all accessible documents in the page hierarchy
   * Includes the main document and same-origin iframe documents
   *
   * @param {Document} rootDocument - The root document to start traversal from
   * @returns {Document[]} Array of all accessible documents
   */
  function collectDocuments(rootDocument) {
    const docs = new Set();

    /**
     * Recursively walks iframe hierarchy to collect documents
     * @param {Document} doc - Current document to process
     */
    function walk(doc) {
      if (!doc || docs.has(doc)) {
        return;
      }

      docs.add(doc);
      const iframes = doc.querySelectorAll("iframe");
      for (const frame of iframes) {
        try {
          if (frame.contentDocument) {
            walk(frame.contentDocument);
          }
        } catch (_error) {
          // Cross-origin frame access is expected to fail silently.
        }
      }
    }

    walk(rootDocument);
    return Array.from(docs);
  }

  /**
   * Collects all DOM roots (documents and shadow roots) within a document
   * Performs breadth-first traversal of shadow DOM tree
   *
   * @param {Document} doc - The document to collect roots from
   * @returns {Array} Array of DOM roots (Document and ShadowRoot objects)
   */
  function collectRoots(doc) {
    const roots = [doc];
    const queue = [doc.documentElement].filter(Boolean);

    // Breadth-first traversal of shadow DOM tree
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || !node.querySelectorAll) {
        continue;
      }

      const elements = node.querySelectorAll("*");
      for (const element of elements) {
        if (element.shadowRoot) {
          roots.push(element.shadowRoot);
          queue.push(element.shadowRoot);
        }
      }
    }

    return roots;
  }

  /**
   * Collects all search roots across the entire page hierarchy
   * Combines document collection with shadow root collection
   *
   * @param {Document} rootDocument - The root document to start from
   * @returns {Array} Array of all DOM roots for searching (documents + shadow roots)
   */
  function collectSearchRoots(rootDocument) {
    const docs = collectDocuments(rootDocument);
    const roots = [];

    for (const doc of docs) {
      roots.push(...collectRoots(doc));
    }

    return roots;
  }

  // Expose the API globally for use by content script
  window[NAMESPACE] = {
    collectDocuments,
    collectRoots,
    collectSearchRoots,
  };
})();
