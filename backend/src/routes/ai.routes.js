
import express from "express";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

// created on first request so .env is guaranteed to be loaded
let llm;
const getLlm = () =>
  (llm ??= new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    apiKey: process.env.GOOGLE_API_KEY,
    temperature: 0.3,
    maxOutputTokens: 300,
  }));

const SYSTEM =
  "You write brief insights for a small store owner from their sales data. " +
  "The data has a selected period ('current') and the period of equal length right before it ('previous'). " +
  "Describe the SELECTED period specifically: say 'today' for a single day, otherwise 'over these N days' or the date range. " +
"Compare current with previous, mention bestDay only when its revenue is less than the current total (skip it if all sales fell on one day), mention the payment split only if it is notable, " +
  "and flag low-stock items only if lowStock is non-empty (it reflects stock right now); otherwise do not mention stock. " +
  "If periodInProgress is true the period is not finished, so do not call lower totals a decline. " +
  "Output at most 3 short bullet points starting with '• ', the last one a concrete suggested action. " +
  "Use only the numbers given and never invent data. Use ₹ for amounts. " +
  "If there is little or no sales data in the period, say so plainly.";

// small cache per date range; keeps Gemini calls far below free-tier limits
const cache = new Map();
const TTL = 5 * 60 * 1000;

async function periodStats(from, to) {
  const r = await Sale.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, status: "COMPLETED" } },
    { $group: { _id: null, revenue: { $sum: "$grandTotal" }, orders: { $sum: 1 } } },
  ]);
  const { revenue = 0, orders = 0 } = r[0] || {};
  return { revenue, orders, avgOrder: orders ? Math.round(revenue / orders) : 0 };
}

const ymd = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

router.get("/insights", authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    let from = new Date(req.query.from);
    let to = new Date(req.query.to);
    if (isNaN(from) || isNaN(to)) {
      from = new Date(now - 864e5); // default: last 24 hours
      to = now;
    }
    if (from > to || to - from > 366 * 864e5) {
      return res.status(400).json({ message: "Invalid date range" });
    }

    const key = `${from.toISOString()}|${to.toISOString()}`;
    const hit = cache.get(key);
    if (!req.query.refresh && hit && Date.now() - hit.at < TTL) {
      return res.json({ insights: hit.text });
    }

    const span = to - from + 1; // ms length of the selected period
    const prevTo = new Date(from - 1);
    const prevFrom = new Date(from - span);
    const days = Math.max(1, Math.round(span / 864e5));

    const [current, previous, best, payments, lowStock] = await Promise.all([
      periodStats(from, to),
      periodStats(prevFrom, prevTo),
      days > 1
        ? Sale.aggregate([
            { $match: { createdAt: { $gte: from, $lte: to }, status: "COMPLETED" } },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" },
                },
                revenue: { $sum: "$grandTotal" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: 1 },
          ])
        : Promise.resolve([]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, status: "COMPLETED" } },
        { $group: { _id: "$paymentMethod", total: { $sum: "$grandTotal" }, count: { $sum: 1 } } },
      ]),
      Product.find({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } })
        .select("name stock lowStockThreshold -_id")
        .limit(10)
        .lean(),
    ]);

    // Aggregates only: no customer names, phones or emails go to the free-tier API
    const data = {
      currency: "INR",
      period: { from: ymd(from), to: ymd(to), days },
      periodInProgress: to > now,
      current,
      previous,
      bestDay: best[0] ? { date: best[0]._id, revenue: best[0].revenue, orders: best[0].orders } : null,
      paymentSplit: payments,
      lowStock: to > now ? lowStock : [],
    };

    const r = await getLlm().invoke([
      ["system", SYSTEM],
      ["human", JSON.stringify(data)],
    ]);

    const text =
      (typeof r.content === "string"
        ? r.content
        : r.content.map((c) => c.text || "").join("")) || "No insights available.";

    if (cache.size > 50) cache.clear();
    cache.set(key, { at: Date.now(), text });
    res.json({ insights: text });
  } catch (err) {
    console.error("AI insights error:", err.message);
    next(err);
  }
});

export default router;