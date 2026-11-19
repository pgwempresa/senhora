// Servidor local pra testar (imita a Vercel) + AmploPay falsa. Uso: node test/servidor.js
const http = require("http"), fs = require("fs"), path = require("path");
const raiz = path.join(__dirname, "..");
const recebidos = []; let pago = false;
const falsa = http.createServer((req, res) => {
  let s = ""; req.on("data", c => s += c); req.on("end", () => {
    recebidos.push({ url: req.url, headers: req.headers, body: JSON.parse(s || "{}") });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url.startsWith("/api/v1/gateway/transactions")) return res.end(JSON.stringify({ id: "t1", status: pago ? "COMPLETED" : "PENDING" }));
    if (req.url.startsWith("/v25.0/")) return res.end(JSON.stringify({ events_received: 1 }));
    if (req.headers["x-secret-key"] !== "SEC") { res.statusCode = 401; return res.end(JSON.stringify({ statusCode: 401, message: "no" })); }
    if (req.url === "/api/v1/gateway/card/receive") {
      const b = JSON.parse(s || "{}");
      if (b.card.number === "4000000000000002") { res.statusCode = 400; return res.end(JSON.stringify({ statusCode: 400, errorCode: "CARD_DECLINED", status: "REJECTED" })); }
      return res.end(JSON.stringify({ transactionId: "c1abcdef", status: b.card.number === "5555555555554444" ? "PENDING" : "COMPLETED", order: { id: "o2" } }));
    }
    res.end(JSON.stringify({ transactionId: "t1abcdef", status: "OK", fee: 1, order: { id: "o1" }, pix: { code: "00020101021126PIXFALSO6304ABCD", image: "", expiresAt: "2026-12-01T00:00:00Z" } }));
  });
}).listen(4101);
process.env.AMPLOPAY_BASE_URL = "http://localhost:4101/api/v1";
process.env.META_GRAPH_URL = "http://localhost:4101"; process.env.META_ACCESS_TOKEN = "TOK";
process.env.AMPLOPAY_PUBLIC_KEY = "PUB"; process.env.AMPLOPAY_SECRET_KEY = "SEC"; process.env.AMPLOPAY_WEBHOOK_TOKEN = "tok123";
const rotas = { "/api/pix": require("../api/pix"), "/api/cartao": require("../api/cartao"), "/api/webhook": require("../api/webhook"), "/api/status": require("../api/status") };
const tipos = { ".html": "text/html", ".jpg": "image/jpeg", ".png": "image/png" };
http.createServer((req, res) => {
  const u = req.url.split("?")[0];
  if (u === "/__pagar") { pago = true; return res.end("ok"); }
  if (u === "/__recebidos") { res.end(JSON.stringify(recebidos)); return; }
  if (rotas[u]) return rotas[u](req, res);
  const f = path.join(raiz, u === "/" ? "index.html" : u);
  if (!f.startsWith(raiz) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end("404"); }
  res.setHeader("Content-Type", tipos[path.extname(f)] || "application/octet-stream"); res.end(fs.readFileSync(f));
}).listen(4100, () => console.log("http://localhost:4100"));
