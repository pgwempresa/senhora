// Manda o Purchase pro Facebook pelo servidor (API de Conversões).
// Variáveis na Vercel: META_ACCESS_TOKEN (obrigatório), META_PIXEL_ID (opcional), META_TEST_EVENT_CODE (opcional, só pra testar no Gerenciador de Eventos).
// O event_id é o mesmo identifier do pedido que o navegador usa, então o Facebook conta uma compra só.
const crypto = require("crypto");

const PIXEL_ID = process.env.META_PIXEL_ID || "2545082356000318";
const VERSAO = process.env.META_API_VERSION || "v25.0";
const GRAPH = (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");

const hash = v => v ? crypto.createHash("sha256").update(String(v).trim().toLowerCase()).digest("hex") : undefined;
const semAcento = v => String(v || "").normalize("NFD").replace(/[^a-z]/gi, "").toLowerCase();
function cookie(req, nome) {
  const m = String((req && req.headers && req.headers.cookie) || "").match(new RegExp("(?:^|;\\s*)" + nome + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : undefined;
}
function ipDe(req) {
  if (!req || !req.headers) return undefined;
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim();
  return ip || undefined;
}

// p: { identifier, total, email, telefone, nome, cidade, uf, cep, req, url }
async function purchase(p) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token || !PIXEL_ID || !p.identifier) return;
  let fone = String(p.telefone || "").replace(/\D/g, "");
  if (fone && !fone.startsWith("55")) fone = "55" + fone;
  const partes = String(p.nome || "").trim().split(/\s+/);
  const req = p.req;
  const user_data = {
    em: [hash(p.email)].filter(Boolean),
    ph: [hash(fone)].filter(Boolean),
    fn: partes[0] ? [hash(semAcento(partes[0]))] : undefined,
    ln: partes.length > 1 ? [hash(semAcento(partes[partes.length - 1]))] : undefined,
    ct: p.cidade ? [hash(semAcento(p.cidade))] : undefined,
    st: p.uf ? [hash(String(p.uf).toLowerCase())] : undefined,
    zp: p.cep ? [hash(String(p.cep).replace(/\D/g, ""))] : undefined,
    country: [hash("br")],
    external_id: [hash(p.identifier)],
    client_ip_address: ipDe(req),
    client_user_agent: req && req.headers ? req.headers["user-agent"] : undefined,
    fbp: cookie(req, "_fbp"),
    fbc: cookie(req, "_fbc"),
  };
  Object.keys(user_data).forEach(k => user_data[k] === undefined && delete user_data[k]);
  const corpo = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: p.identifier,
      action_source: "website",
      event_source_url: p.url || undefined,
      user_data,
      custom_data: { value: Number(p.total) || 0, currency: "BRL", content_name: "Calendario 2027", order_id: p.identifier },
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) corpo.test_event_code = process.env.META_TEST_EVENT_CODE;
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(`${GRAPH}/${VERSAO}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: ctrl.signal });
    if (!r.ok) { const d = await r.json().catch(() => ({})); console.error("Meta CAPI erro", r.status, d.error && d.error.message); }
  } catch (e) { console.error("Meta CAPI falhou", e.name); }
  finally { clearTimeout(t); }
}

module.exports = { purchase, PIXEL_ID };
