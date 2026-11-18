// Pergunta pra AmploPay se o Pix já foi pago. Só devolve o status, nada de dado da pessoa.
const BASE = (process.env.AMPLOPAY_BASE_URL || "https://app.amplopay.com/api/v1").replace(/\/$/, "");
function json(res, code, obj) { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); }
module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { erro: "Método não permitido" });
  const pub = process.env.AMPLOPAY_PUBLIC_KEY, sec = process.env.AMPLOPAY_SECRET_KEY;
  if (!pub || !sec) return json(res, 500, { erro: "Pagamento não configurado" });
  const id = String((req.query && req.query.id) || new URL(req.url, "http://x").searchParams.get("id") || "").trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return json(res, 400, { erro: "Pedido inválido" });
  try {
    const r = await fetch(`${BASE}/gateway/transactions?id=${encodeURIComponent(id)}`, { headers: { "x-public-key": pub, "x-secret-key": sec } });
    const d = await r.json().catch(() => ({}));
    const t = Array.isArray(d) ? d[0] : d;
    if (!r.ok || !t || !t.status) return json(res, 502, { erro: "Não consegui conferir agora" });
    json(res, 200, { status: t.status });
  } catch (e) { json(res, 502, { erro: "Não consegui conferir agora" }); }
};
