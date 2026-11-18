// Recebe o aviso da AmploPay quando o Pix é pago.
// Na AmploPay, o webhook de API tem um token. Coloque o mesmo token na variável AMPLOPAY_WEBHOOK_TOKEN.
const crypto = require("crypto");

function json(res, code, obj) { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); }
function lerBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise(ok => { let s = ""; req.on("data", c => { s += c; if (s.length > 200000) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { ok({}); } }); });
}
function igual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { erro: "Método não permitido" });
  const esperado = process.env.AMPLOPAY_WEBHOOK_TOKEN;
  if (!esperado) return json(res, 500, { erro: "Webhook não configurado" });
  const p = await lerBody(req);
  if (!p.token || !igual(p.token, esperado)) return json(res, 401, { erro: "Token inválido" });

  if (p.event === "TRANSACTION_PAID" && p.transaction && p.transaction.status === "COMPLETED") {
    const item = (p.orderItems && p.orderItems[0] && p.orderItems[0].product) || {};
    const venda = {
      evento: "pago",
      pedido: p.transaction.identifier,
      transacao: p.transaction.id,
      produto: item.name || "",
      valor: p.transaction.amount,
      pagoEm: p.transaction.payedAt,
      cliente: { nome: p.client && p.client.name, email: p.client && p.client.email, telefone: p.client && p.client.phone },
    };
    console.log("PAGO", venda.pedido, venda.produto, venda.valor);
    // Opcional: repassa a venda pra outra ferramenta (Make, n8n, planilha, Utmify...)
    if (process.env.FORWARD_WEBHOOK_URL) {
      try { await fetch(process.env.FORWARD_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(venda) }); }
      catch (e) { console.error("Falha ao repassar a venda"); }
    }
  }
  json(res, 200, { ok: true });
};
