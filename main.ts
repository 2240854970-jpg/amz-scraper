// Amazon Product Scraper - Deno Deploy
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  
  try {
    const { url } = await req.json();
    if (!url) return new Response(JSON.stringify({ error: "missing url" }), { status: 400 });

    // Fetch with browser-like headers
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    const html = await res.text();
    const title = (html.match(/<span[^>]*id="productTitle"[^>]*>([^<]+)<\//) || [])[1]?.trim() || "";
    const rating = (html.match(/(\d+\.\d+) out of 5/) || [])[1] || "";
    const reviews = (html.match(/([\d,]+) ratings/) || [])[1]?.replace(/,/g, "") || "";
    const priceWhole = (html.match(/a-price-whole[^>]*>([\d,.]+)<\//) || [])[1]?.replace(/[.,]/g, "") || "";
    const priceFrac = (html.match(/a-price-fraction[^>]*>(\d+)<\//) || [])[1] || "";
    const price = priceWhole ? `$${priceWhole}${priceFrac ? "." + priceFrac : ""}` : "";
    const bullets = [...html.matchAll(/<span class="a-list-item">([^<]{10,200})<\/span>/g)].slice(0, 5).map(m => m[1].trim());
    
    const jsonLd = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
    let jsonData = {};
    if (jsonLd) {
      try { jsonData = JSON.parse(jsonLd); } catch {}
    }

    return new Response(JSON.stringify({
      title,
      rating,
      reviews,
      price,
      bullets,
      jsonLd: jsonData,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
