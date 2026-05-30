'use strict';

const FILE = 'FILE';
const DIR = 'DIR';

function buildTreeFromFlatFiles(entries) {
  const byPath = new Map();
  for (const e of entries) {
    const p = e.path.replace(/\\/g, '/');
    byPath.set(p, e);
  }
  const root = { type: DIR, name: '', children: [] };
  const sortedPaths = [...byPath.keys()].sort();
  for (const relPath of sortedPaths) {
    const e = byPath.get(relPath);
    const parts = relPath.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const last = i === parts.length - 1;
      if (last) {
        node.children = node.children.filter((c) => c.name !== part);
        node.children.push({
          type: FILE,
          name: part,
          size: e.size,
          digest: e.md5,
          relPath
        });
      } else {
        let sub = node.children.find((c) => c.type === DIR && c.name === part);
        if (!sub) {
          sub = { type: DIR, name: part, children: [] };
          node.children.push(sub);
        }
        node = sub;
      }
    }
  }
  sortTree(root);
  return root;
}

function sortTree(node) {
  if (node.type !== DIR) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === DIR ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

function stableStringify(val) {
  if (val === null || typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(',')}]`;
  const keys = Object.keys(val).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(val[k])}`).join(',')}}`;
}

module.exports = {
  FILE,
  DIR,
  buildTreeFromFlatFiles,
  stableStringify
};
