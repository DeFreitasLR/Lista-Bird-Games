// Serverless function (Vercel). Keeps the GitHub token on the server only —
// it is never sent to the browser and never lives in the public repo, so it
// can't be picked up by GitHub's secret scanning / auto-revocation.
//
// SETUP (one time, in the Vercel dashboard — not in this file):
//   1. Generate a NEW classic Personal Access Token at
//      https://github.com/settings/tokens/new with ONLY the "gist" scope.
//   2. In your Vercel project: Settings -> Environment Variables -> Add:
//         Name:  GIST_TOKEN
//         Value: <paste the new token>
//      Apply it to Production (and Preview if you want it there too).
//   3. Redeploy (Vercel prompts you to redeploy after adding an env var).
//
// GIST_ID below is not secret (it's already visible in the gist's own URL),
// so it's fine to leave it hardcoded here.

const GIST_ID = '008608577764d89b5ca7bbd745847ed3';
const FILENAME = 'gistfile1.txt';
const GIST_API = `https://api.github.com/gists/${GIST_ID}`;
const DEFAULT_REGISTRY = ['Lucas Freitas'];

async function readRegistry(headers) {
  const r = await fetch(GIST_API, { headers });
  if (!r.ok) return { ok: false, status: r.status, arr: DEFAULT_REGISTRY.slice() };
  const data = await r.json();
  const file = data.files && data.files[FILENAME];
  if (!file || !file.content) return { ok: true, status: r.status, arr: DEFAULT_REGISTRY.slice() };
  try {
    const arr = JSON.parse(file.content);
    return { ok: true, status: r.status, arr: Array.isArray(arr) ? arr : DEFAULT_REGISTRY.slice() };
  } catch (e) {
    return { ok: true, status: r.status, arr: DEFAULT_REGISTRY.slice() };
  }
}

module.exports = async function handler(req, res) {
  const token = process.env.GIST_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'GIST_TOKEN não configurado nas variáveis de ambiente do Vercel.' });
  }

  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
  };

  try {
    if (req.method === 'GET') {
      const result = await readRegistry(headers);
      return res.status(200).json(result.arr);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const name = body && body.name ? String(body.name).slice(0, 60) : '';
      if (!name) {
        return res.status(400).json({ error: 'Campo "name" é obrigatório.' });
      }

      const current = await readRegistry(headers);
      const arr = current.arr.slice();
      arr.push(name);

      const patchRes = await fetch(GIST_API, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [FILENAME]: { content: JSON.stringify(arr) } } }),
      });

      if (!patchRes.ok) {
        const text = await patchRes.text();
        return res.status(patchRes.status).json({ error: 'Falha ao atualizar o gist.', details: text });
      }

      return res.status(200).json(arr);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
