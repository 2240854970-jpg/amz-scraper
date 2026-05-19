// Amazon scraper - @sparticuz/chromium + puppeteer-core
import express from "express";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "missing url" });

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(url, { waitUntil: "load", timeout: 25000 });
    await page.waitForSelector("#productTitle", { timeout: 5000 }).catch(() => {});

    const data = await page.evaluate(() => {
      const t = (s: string) => document.querySelector(s)?.textContent?.trim() || "";
      const ratingText = t("#acrPopover") || t('[data-hook="rating-out-of-text"]');
      const rating = (ratingText.match(/(\d+\.?\d*)/) || [])[1] || "";
      const reviews = (t("#acrCustomerReviewText").match(/([\d,]+)/) || [])[1]?.replace(/,/g, "") || "";
      const whole = t(".a-price-whole")?.replace(/[.,]/g, "") || "";
      const frac = t(".a-price-fraction") || "";
      const price = whole ? `$${whole}${frac ? "." + frac : ""}` : "";
      let bsr = "";
      document.querySelectorAll("tr").forEach((row) => {
        if (row.textContent?.includes("Best Sellers Rank")) {
          const m = row.textContent.match(/#([\d,]+)/);
          if (m) bsr = m[1].replace(/,/g, "");
        }
      });
      const bullets = Array.from(document.querySelectorAll("#feature-bullets li span"))
        .map((s) => s.textContent?.trim()).filter(Boolean).slice(0, 5);
      const desc = (document.querySelector("#productDescription p")?.textContent || "").substring(0, 500);
      return { title: t("#productTitle"), rating, reviews, price, bsr, bulletPoints: bullets, description: desc };
    });

    await browser.close();
    if (!data.title) return res.status(404).json({ error: "no title" });
    return res.json(data);
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: String(e) });
  }
});

app.get("/", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("amz-scraper on " + PORT));
