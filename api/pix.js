// Cria a cobrança Pix na AmploPay. As chaves ficam só aqui no servidor (variáveis da Vercel).
const crypto = require("crypto");
function cpfOk(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) { let t = 0; for (let i = 0; i < n; i++) t += +c[i] * (n + 1 - i); if ((t * 10) % 11 % 10 !== +c[n]) return false; }
  return true;
}
const { VALOR_MIN, VALOR_MAX, produtoPorValor } = require("./_produto");

const BASE = (process.env.AMPLOPAY_BASE_URL || "https://app.amplopay.com/api/v1").replace(/\/$/, "");

function json(res, code, obj) { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); }
function lerBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise(ok => { let s = ""; req.on("data", c => { s += c; if (s.length > 20000) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { ok({}); } }); });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { erro: "Método não permitido" });
  const pub = process.env.AMPLOPAY_PUBLIC_KEY, sec = process.env.AMPLOPAY_SECRET_KEY;
  if (!pub || !sec) return json(res, 500, { erro: "Pagamento não configurado" });

  const b = await lerBody(req);
  const valor = Number(b.valor);
  const nome = String(b.nome || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  const fone = String(b.telefone || "").replace(/\D/g, "");
  const doc = String(b.documento || "").replace(/\D/g, "");

  if (!Number.isInteger(valor) || valor < VALOR_MIN || valor > VALOR_MAX) return json(res, 400, { erro: `Valor tem que ser de ${VALOR_MIN} a ${VALOR_MAX} reais` });
  if (nome.length < 2) return json(res, 400, { erro: "Falta o nome" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(res, 400, { erro: "E-mail inválido" });
  if (fone.length < 10 || fone.length > 13) return json(res, 400, { erro: "WhatsApp inválido" });

  if (!cpfOk(doc)) return json(res, 400, { erro: "CPF inválido" });

  const prod = produtoPorValor(valor);
  const identifier = "cal-" + crypto.randomBytes(8).toString("hex");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const payload = {
    identifier,
    amount: valor,
    client: { name: nome, email, phone: fone, document: doc },
    products: [{ id: prod.id, name: prod.nome, quantity: 1, price: valor }],
    metadata: { provider: "calendario-2027", orderId: identifier },
    callbackUrl: process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/webhook` : `${proto}://${host}/api/webhook`,
  };

  let r, d;
  try {
    r = await fetch(`${BASE}/gateway/pix/receive`, { method: "POST", headers: { "Content-Type": "application/json", "x-public-key": pub, "x-secret-key": sec }, body: JSON.stringify(payload) });
    d = await r.json().catch(() => ({}));
  } catch (e) { return json(res, 502, { erro: "Não consegui falar com o pagamento. Tente de novo." }); }

  if (!r.ok || !d.pix || !d.pix.code || d.status === "FAILED" || d.status === "REJECTED") {
    console.error("AmploPay erro", r.status, d.errorCode, d.message, JSON.stringify(d.details || d.errorDescription || ""));
    return json(res, 502, { erro: "Não foi possível gerar o Pix agora. Tente de novo." });
  }
  json(res, 200, { identifier, transactionId: d.transactionId, produto: prod.nome, valor, pix: { code: d.pix.code, image: d.pix.image || "", expiresAt: d.pix.expiresAt || "" } });
};
