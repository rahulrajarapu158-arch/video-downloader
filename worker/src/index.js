addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});

// Use Cloudflare Tunnel URL for the VPS backend
const VPS_BACKEND = "http://98.70.56.106:8080";

async function handleRequest(event) {
    const request = event.request;
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/health") {
        return new Response(
            JSON.stringify({ status: "ok", service: "videograb-worker" }),
            { headers: Object.assign({}, corsHeaders, {"Content-Type": "application/json"}) }
        );
    }

    if (url.pathname === "/api/extract" && request.method === "POST") {
        try {
            const body = await request.json();
            
            const resp = await fetch(VPS_BACKEND + "/api/extract", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            });
            
            const data = await resp.json();
            
            return new Response(JSON.stringify(data), {
                status: resp.status,
                headers: Object.assign({}, corsHeaders, {"Content-Type": "application/json"}),
            });
        } catch (err) {
            return new Response(
                JSON.stringify({error: "Worker error", details: err.message}),
                {status: 500, headers: Object.assign({}, corsHeaders, {"Content-Type": "application/json"})}
            );
        }
    }

    return new Response(JSON.stringify({error: "Not found"}), {
        status: 404,
        headers: Object.assign({}, corsHeaders, {"Content-Type": "application/json"}),
    });
}