import { HttpError } from './auth.mjs';
import { LIBRARY_PATH, blobText, parseLibrary, writablePath } from './content.mjs';

export class GitHub {
  constructor(env, token, fetchImpl = (...args) => fetch(...args)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(env.REPO_OWNER) || !/^[A-Za-z0-9_.-]+$/.test(env.REPO_NAME) || !/^[A-Za-z0-9_.-]+$/.test(env.REPO_BRANCH)) throw new HttpError(503, '后台仓库配置不正确。');
    this.base = `/repos/${env.REPO_OWNER}/${env.REPO_NAME}`;
    this.branch = env.REPO_BRANCH;
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  async api(path, method = 'GET', data) {
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    if (!response.ok) {
      if (response.status === 401) throw new HttpError(401, '令牌已失效，请重新连接。', 'session_expired');
      if (response.status === 403 || response.status === 404) throw new HttpError(403, '令牌无法访问这个仓库或操作，请检查仓库选择和权限。', 'github_permission');
      if (response.status === 422 || response.status === 409) throw new HttpError(409, '仓库内容已经变化，请刷新列表后再保存。', 'conflict');
      throw new HttpError(502, 'GitHub 暂时无法完成请求，请稍后重试。', 'github_unavailable');
    }
    return response.status === 204 ? null : response.json();
  }

  async snapshot(expected) {
    const ref = await this.api(`${this.base}/git/ref/heads/${this.branch}`);
    const revision = ref.object.sha;
    if (expected !== undefined && (!/^[a-f0-9]{40}$/.test(expected) || expected !== revision)) throw new HttpError(409, '内容已被其他操作更新。请刷新列表，再重新保存。', 'conflict');
    const commit = await this.api(`${this.base}/git/commits/${revision}`);
    const tree = await this.api(`${this.base}/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new HttpError(503, '仓库文件数量过多，暂时无法完整读取。');
    const blobs = new Map(tree.tree.filter(item => item.type === 'blob').map(item => [item.path, item]));
    const library = blobs.get(LIBRARY_PATH);
    if (!library) throw new HttpError(404, '找不到资料库配置。');
    return { revision, tree: commit.tree.sha, blobs, library: parseLibrary(await this.readBlob(library.sha)) };
  }

  async verifyOwner(ownerId) {
    const user = await this.api('/user');
    if (String(user.id) !== String(ownerId)) throw new HttpError(403, '这个后台仅对站主开放。', 'owner_only');
    const repo = await this.api(this.base);
    const canWrite = repo.permissions ? Boolean(repo.permissions.push) : String(repo.owner?.id) === String(ownerId);
    if (!canWrite) throw new HttpError(403, '这个账号没有仓库写入权限。', 'github_permission');
    return { id: user.id, login: user.login };
  }

  async readBlob(sha) {
    const value = await this.api(`${this.base}/git/blobs/${sha}`);
    return blobText(value.content);
  }

  async commit(snapshot, changes, message) {
    // 在任何写入发生前，统一检查所有文件路径。
    for (const change of changes) writablePath(change.path);
    const tree = [];
    for (const change of changes) {
      let sha = change.sha;
      if (change.text !== undefined || change.base64 !== undefined) {
        const blob = await this.api(`${this.base}/git/blobs`, 'POST', { content: change.text ?? change.base64, encoding: change.text !== undefined ? 'utf-8' : 'base64' });
        sha = blob.sha;
      }
      tree.push({ path: change.path, mode: '100644', type: 'blob', sha });
    }
    const newTree = await this.api(`${this.base}/git/trees`, 'POST', { base_tree: snapshot.tree, tree });
    const commit = await this.api(`${this.base}/git/commits`, 'POST', { message, tree: newTree.sha, parents: [snapshot.revision] });
    // 非强制更新：并发修改不会被覆盖，GitHub 会返回冲突。
    await this.api(`${this.base}/git/refs/heads/${this.branch}`, 'PATCH', { sha: commit.sha, force: false });
    return { commit: commit.sha, url: commit.html_url, message: '已保存到 GitHub，网站正在发布。' };
  }

  async deployment(sha) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new HttpError(400, '提交号不正确。');
    const data = await this.api(`${this.base}/actions/runs?head_sha=${sha}&per_page=20`);
    const run = data.workflow_runs.find(item => item.name === 'Deploy Hugo site to Pages');
    return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : { status: 'queued', conclusion: null };
  }
}
