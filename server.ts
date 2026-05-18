// Amazon 商品页抓取微服务
// 部署到 Render（免费），Playwright + Chromium

import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { url } = req.body;

  if (!url || (!url.includes("amazon.com/dp/") && !url.includes("amazon.com/gp/product/"))) {
    return res.status(400).json({ error: "请提供有效的 Amazon 商品链接" });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    // 等待商品标题出现
    await page.waitForSelector("#productTitle", { timeout: 10000 }).catch(() => {});

    const data = await page.evaluate(() => {
      const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || "";
      const getRating = () => {
        const el = document.querySelector("#acrPopover") || document.querySelector('[data-hook="rating-out-of-text"]');
        return el?.textContent?.trim()?.match(/(\d+\.?\d*)/)?.[1] || "";
      };
      const getReviews = () => {
        const el = document.querySelector("#acrCustomerReviewText");
        return el?.textContent?.trim()?.match(/([\d,]+)/)?.[1]?.replace(/,/g, "") || "";
      };
      const getPrice = () => {
        const whole = document.querySelector(".a-price-whole")?.textContent?.trim() || "";
        const fraction = document.querySelector(".a-price-fraction")?.textContent?.trim() || "";
        return whole ? `$${whole}${fraction ? "." + fraction : ""}` : "";
      };
      const getBSR = () => {
        const rows = document.querySelectorAll("#productDetails_detailBullets_sections1 tr, #detailBullets_feature_div tr, .prodDetTable tr");
        for (const row of rows) {
          if (row.textContent?.includes("Best Sellers Rank")) {
            return row.textContent.match(/#([\d,]+)/)?.[1]?.replace(/,/g, "") || "";
          }
        }
        return "";
      };
      const getBulletPoints = () => {
        return Array.from(document.querySelectorAll("#feature-bullets li span")).map(s => s.textContent?.trim()).filter(Boolean).slice(0, 5);
      };
      const getDescription = () => {
        return document.querySelector("#productDescription p")?.textContent?.trim()?.substring(0, 500) || "";
      };
      const getBrand = () => {
        const el = document.querySelector("#bylineInfo");
        return el?.textContent?.trim()?.replace("Visit the", "").replace("Store", "").trim() || "";
      };
      const getCategory = () => {
        const el = document.querySelector("#wayfinding-breadcrumbs_feature_div ul");
        return el?.textContent?.trim()?.replace(/\s+/g, " > ") || "";
      };

      return {
        title: getText("#productTitle"),
        rating: getRating(),
        reviews: getReviews(),
        price: getPrice(),
        bsr: getBSR(),
        brand: getBrand(),
        category: getCategory(),
        bulletPoints: getBulletPoints(),
        description: getDescription(),
      };
    });

    await browser.close();

    if (!data.title) {
      return res.status(404).json({ error: "未能提取商品数据，链接可能无效" });
    }

    return res.json(data);
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: String(error) });
  }
});

// 健康检查
app.get("/", (_req, res) => res.json({ status: "ok", service: "amz-scraper" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`amz-scraper running on port ${PORT}`));
