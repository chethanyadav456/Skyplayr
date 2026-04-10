(function shadowWalkerModule() {
  const NAMESPACE = "SkyplayrShadowWalker";

  function collectDocuments(rootDocument) {
    const docs = new Set();

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

  function collectRoots(doc) {
    const roots = [doc];
    const queue = [doc.documentElement].filter(Boolean);

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

  function collectSearchRoots(rootDocument) {
    const docs = collectDocuments(rootDocument);
    const roots = [];

    for (const doc of docs) {
      roots.push(...collectRoots(doc));
    }

    return roots;
  }

  window[NAMESPACE] = {
    collectDocuments,
    collectRoots,
    collectSearchRoots,
  };
})();
