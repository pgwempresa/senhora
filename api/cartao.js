// Cobra no cartão de crédito pela AmploPay. As chaves ficam só aqui no servidor (variáveis da Vercel).
// Os dados do cartão passam direto pra AmploPay: não são gravados nem aparecem no log.
const crypto = require("crypto");
const { VALOR_MIN, VALOR_MAX, PARCELAS_MAX, BUMPS, produtoPorValor } = require("./_produto");
const meta = require("./_meta");

const BASE = (process.env.AMPLOPAY_BASE_URL || "https://app.amplopay.com/api/v1").replace(/\/$/, "");
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function json(res, code, obj) { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); }
function lerBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise(ok => { let s = ""; req.on("data", c => { s += c; if (s.length > 20000) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { ok({}); } }); });
}
function cpfOk(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) { let t = 0; for (let i = 0; i < n; i++) t += +c[i] * (n + 1 - i); if ((t * 10) % 11 % 10 !== +c[n]) return false; }
  return true;
}
function luhn(n) { let t = 0; for (let i = 0; i < n.length; i++) { let d = +n[n.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; } return t % 10 === 0; }
const txt = (v, max) => String(v || "").trim().replace(/\s+/g, " ").slice(0, max);

const APROVADO = ["COMPLETED", "APPROVED", "PAID", "AUTHORIZED"];
const RECUSADO = ["FAILED", "REJECTED", "REFUSED", "DECLINED", "CANCELED", "CANCELLED"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { erro: "Método não permitido" });
  const pub = process.env.AMPLOPAY_PUBLIC_KEY, sec = process.env.AMPLOPAY_SECRET_KEY;
  if (!pub || !sec) return json(res, 500, { erro: "Pagamento não configurado" });

  const b = await lerBody(req);
  const valor = Number(b.valor);
  const nome = txt(b.nome, 80);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  const fone = String(b.telefone || "").replace(/\D/g, "");
  const doc = String(b.documento || "").replace(/\D/g, "");
  const parcelas = b.parcelas == null ? 1 : Number(b.parcelas);
  const e = b.endereco || {}, c = b.cartao || {};
  const end = { cep: String(e.cep || "").replace(/\D/g, ""), rua: txt(e.rua, 120), numero: txt(e.numero, 20), complemento: txt(e.complemento, 60), bairro: txt(e.bairro, 80), cidade: txt(e.cidade, 80), uf: txt(e.uf, 2).toUpperCase() };
  const num = String(c.numero || "").replace(/\D/g, ""), dono = txt(c.nome, 60).toUpperCase(), cvv = String(c.cvv || "").replace(/\D/g, "");
  const val = String(c.validade || "").replace(/\D/g, ""); // MMAA
  const mes = +val.slice(0, 2), ano = 2000 + +val.slice(2, 4);
  const agora = new Date(), venceu = ano < agora.getFullYear() || (ano === agora.getFullYear() && mes < agora.getMonth() + 1);

  if (!Number.isInteger(valor) || valor < VALOR_MIN || valor > VALOR_MAX) return json(res, 400, { erro: `Valor tem que ser de ${VALOR_MIN} a ${VALOR_MAX} reais` });
  if (nome.length < 3) return json(res, 400, { erro: "Escreva o nome completo" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(res, 400, { erro: "E-mail inválido" });
  if (fone.length < 10 || fone.length > 13) return json(res, 400, { erro: "WhatsApp inválido" });
  if (!cpfOk(doc)) return json(res, 400, { erro: "CPF inválido" });
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > PARCELAS_MAX) return json(res, 400, { erro: "Parcelas inválidas" });
  if (end.cep.length !== 8) return json(res, 400, { erro: "CEP inválido" });
  if (!end.rua || !end.numero || !end.bairro || !end.cidade || !UFS.includes(end.uf)) return json(res, 400, { erro: "Confira o endereço" });
  if (num.length < 14 || num.length > 19 || !luhn(num)) return json(res, 400, { erro: "Número do cartão inválido" });
  if (dono.length < 3) return json(res, 400, { erro: "Escreva o nome como está no cartão" });
  if (val.length !== 4 || mes < 1 || mes > 12 || venceu) return json(res, 400, { erro: "Validade do cartão inválida" });
  if (cvv.length < 3 || cvv.length > 4) return json(res, 400, { erro: "Código de segurança inválido" });

  const pedidos = Array.isArray(b.extras) ? [...new Set(b.extras.map(String))] : [];
  const extras = pedidos.map(id => BUMPS.find(x => x.id === id));
  if (extras.some(x => !x)) return json(res, 400, { erro: "Oferta inválida" });
  const total = valor + extras.reduce((t, x) => t + x.valor, 0);

  const prod = produtoPorValor(valor);
  const identifier = "cal-" + crypto.randomBytes(8).toString("hex");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "").split(",")[0].trim().replace(/^::ffff:/, "") || "0.0.0.0";
  const payload = {
    identifier,
    amount: total,
    installments: parcelas,
    clientIp: ip,
    client: {
      name: nome, email, phone: fone, document: doc,
      address: { country: "BR", zipCode: end.cep, state: end.uf, city: end.cidade, neighborhood: end.bairro, street: end.rua, number: end.numero, ...(end.complemento ? { complement: end.complemento } : {}) },
    },
    card: { number: num, owner: dono, expiresAt: `${ano}-${String(mes).padStart(2, "0")}`, cvv },
    products: [{ id: prod.id, name: prod.nome, quantity: 1, price: valor }, ...extras.map(x => ({ id: "extra-" + x.id, name: x.nome, quantity: 1, price: x.valor }))],
    metadata: { provider: "calendario-2027", orderId: identifier, metodo: "cartao" },
    callbackUrl: process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, "")}/api/webhook` : `${proto}://${host}/api/webhook`,
  };

  let r, d;
  try {
    r = await fetch(`${BASE}/gateway/card/receive`, { method: "POST", headers: { "Content-Type": "application/json", "x-public-key": pub, "x-secret-key": sec }, body: JSON.stringify(payload) });
    d = await r.json().catch(() => ({}));
  } catch (err) { return json(res, 502, { erro: "Não consegui falar com o pagamento. Tente de novo." }); }

  const st = String(d.status || (d.transaction && d.transaction.status) || "").toUpperCase();
  const tid = d.transactionId || (d.transaction && d.transaction.id) || "";
  // só o status e o código do erro vão pro log (nada do cartão)
  if (!r.ok || RECUSADO.includes(st)) {
    console.error("AmploPay cartão", r.status, st, d.errorCode, d.message);
    if (r.status >= 500 || r.status === 401 || r.status === 403) return json(res, 502, { erro: "Não foi possível pagar no cartão agora. Tente de novo ou pague no Pix." });
    return json(res, 402, { erro: "O cartão não foi aprovado. Confira os dados, tente outro cartão ou pague no Pix.", status: "recusado" });
  }
  const status = APROVADO.includes(st) ? "pago" : "analise";
  // Cartão: o Purchase só vai pro Facebook quando aprova (se ficar em análise, vai pelo webhook)
  if (status === "pago") await meta.purchase({ identifier, total, email, telefone: fone, nome, cidade: end.cidade, uf: end.uf, cep: end.cep, req, url: req.headers.referer });
  json(res, 200, { identifier, transactionId: tid, produto: prod.nome, valor, total, parcelas, status });
};
