addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event));
});

const COBALT_API = "https://api.cobalt.tools/";
const ALLOWED_ORIGINS = ["*"];

async function handleRequest(event) {
    const request = event.request;
    const url = new URL(request.url);
    const origin = request.headers.get("origin") || "";

    // CORS headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/health") {
        return new Response(
            JSON.stringify({ status: "ok", service: "video-downloader" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // API: Extract video
    if (url.pathname === "/api/extract" && request.method === "POST") {
        return handleExtract(request, corsHeaders);
    }

    return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

async function handleExtract(request, corsHeaders) {
    try {
        const body = await request.json();
        const { url, quality = "720" } = body;

        if (!url) {
            return jsonResponse({ error: "URL is required" }, 400, corsHeaders);
        }

        // Validate URL
        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(url)) {
            return jsonResponse({ error: "Invalid URL format" }, 400, corsHeaders);
        }

        // Call cobalt.tools API
        const cobaltResponse = await fetch(COBALT_API, {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url: url,
                videoQuality: quality,
                filenameStyle: "basic",
            }),
        });

        if (!cobaltResponse.ok) {
            const errorText = await cobaltResponse.text();
            return jsonResponse(
                { error: "Extraction failed", details: errorText },
                cobaltResponse.status,
                corsHeaders
            );
        }

        const data = await cobaltResponse.json();

        // cobalt.tools returns: { "url": "..." } for direct downloads
        // or { "status": "tunnel", "url": "..." } for tunneled downloads
        // or { "status": "error", "text": "..." } for errors
        if (data.status === "error") {
            return jsonResponse(
                { error: data.text || "Unknown extraction error" },
                422,
                corsHeaders
            );
        }

        return jsonResponse({
            success: true,
            downloadUrl: data.url,
            title: data.filename || "video",
            status: data.status || "direct",
        }, 200, corsHeaders);
    } catch (err) {
        return jsonResponse(
            { error: "Internal error", details: err.message },
            500,
            corsHeaders
        );
    }
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...extraHeaders,
            "Content-Type": "application/json",
        },
    });
}
