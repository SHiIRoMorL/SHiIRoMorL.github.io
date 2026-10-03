import { createHash } from 'node:crypto';
import { encodeBase64 } from '../src/content.mjs';

const hash = value => createHash('sha1').update(value).digest('hex');
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

export class FakeGitHub {
  constructor(files, options = {}) {
    this.options = options;
    this.blobs = new Map(); this.trees = new Map(); this.commits = new Map(); this.calls = []; this.counter = 0;
    const tree = new Map();
    for (const [path, source] of Object.entries(files)) {
      const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source;
      const sha = hash(bytes); this.blobs.set(sha, bytes); tree.set(path, sha);
    }
    const treeSha = hash('initial-tree'); this.trees.set(treeSha, tree);
    this.head = '1'.repeat(40); this.commits.set(this.head, { tree: { sha: treeSha } });
    this.fetch = this.fetch.bind(this);
  }

  files() {
    const tree = this.trees.get(this.commits.get(this.head).tree.sha);
    return Object.fromEntries([...tree].map(([path, sha]) => [path, this.blobs.get(sha)]));
  }

  async fetch(url, options = {}) {
    const parsed = new URL(url); const method = options.method || 'GET';
    this.calls.push({ path: parsed.pathname, method });
    if (this.options.rejectToken) return response({}, 401);
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (parsed.pathname === '/user') return response({ id: this.options.ownerId || 268295554, login: 'SHiIRoMorL' });
    const base = '/repos/SHiIRoMorL/SHiIRoMorL.github.io';
    if (!parsed.pathname.startsWith(base)) return response({}, 404);
    const route = parsed.pathname.slice(base.length);
    if (route === '') return response(this.options.omitPermissions ? { owner: { id: 268295554 } } : { permissions: { push: this.options.push !== false } });
    if (route === '/git/ref/heads/main') return response({ object: { sha: this.head } });
    if (route.startsWith('/git/commits/') && method === 'GET') return response(this.commits.get(route.split('/').at(-1)), 200);
    if (route.startsWith('/git/trees/') && method === 'GET') {
      const tree = this.trees.get(route.split('/').at(-1));
      return response({ truncated: false, tree: [...tree].map(([path, sha]) => ({ path, sha, type: 'blob', size: this.blobs.get(sha).length })) });
    }
    if (route.startsWith('/git/blobs/') && method === 'GET') {
      const bytes = this.blobs.get(route.split('/').at(-1)); return bytes ? response({ content: encodeBase64(bytes), encoding: 'base64' }) : response({}, 404);
    }
    if (route === '/git/blobs' && method === 'POST') {
      const bytes = body.encoding === 'base64' ? Uint8Array.from(atob(body.content), c => c.charCodeAt(0)) : new TextEncoder().encode(body.content);
      const sha = hash(bytes); this.blobs.set(sha, bytes); return response({ sha }, 201);
    }
    if (route === '/git/trees' && method === 'POST') {
      const tree = new Map(this.trees.get(body.base_tree));
      for (const entry of body.tree) entry.sha === null ? tree.delete(entry.path) : tree.set(entry.path, entry.sha);
      this.lastTreeChanges = body.tree;
      const sha = hash('tree-' + ++this.counter); this.trees.set(sha, tree); return response({ sha }, 201);
    }
    if (route === '/git/commits' && method === 'POST') {
      const sha = hash('commit-' + ++this.counter); this.commits.set(sha, { ...body, tree: { sha: body.tree } });
      return response({ sha, html_url: `https://github.com/SHiIRoMorL/SHiIRoMorL.github.io/commit/${sha}` }, 201);
    }
    if (route === '/git/refs/heads/main' && method === 'PATCH') {
      this.lastRef = body;
      if (this.options.race || body.force !== false || this.commits.get(body.sha).parents[0] !== this.head) return response({}, 422);
      this.head = body.sha; return response({ object: { sha: this.head } });
    }
    if (route === '/actions/runs') return response({ workflow_runs: [{ name: 'Deploy Hugo site to Pages', status: 'completed', conclusion: 'success', html_url: 'https://github.com/SHiIRoMorL/SHiIRoMorL.github.io/actions' }] });
    return response({}, 404);
  }
}
