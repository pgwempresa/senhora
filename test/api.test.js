// Testa as rotas /api com a AmploPay falsa. Uso: node test/servidor.js (em outro terminal) e depois node test/api.test.js
const assert = require("assert");
const B = "http://localhost:4100";
const post = (p, b) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async r => ({ s: r.status, d: await r.json() }));
const base = { valor: 50, nome: "Maria", email: "maria@teste.com", telefone: "(11) 9 8888-7777", documento: "529.982.247-25" };
const recebidos = () => fetch(B + "/__recebidos").then(x => x.json());
const fbDe = async id => (await recebidos()).filter(x => x.url.startsWith("/v25.0/2545082356000318/events?access_token=TOK") && x.body.data[0].event_id === id).map(x => x.body.data[0]);
const sha = v => require("crypto").createHash("sha256").update(v).digest("hex");
(async () => {
  let r = await post("/api/pix", base);
  assert.equal(r.s, 200); assert.ok(r.d.pix.code); assert.equal(r.d.produto, "Calendário 03");
  const env = (await recebidos()).filter(x => x.url === "/api/v1/gateway/pix/receive").pop();
  assert.equal(env.url, "/api/v1/gateway/pix/receive"); assert.equal(env.headers["x-public-key"], "PUB"); assert.equal(env.headers["x-secret-key"], "SEC");
  assert.equal(env.body.amount, 50); assert.equal(env.body.products[0].name, "Calendário 03"); assert.equal(env.body.products[0].price, 50);
  assert.equal(env.body.client.phone, "11988887777"); assert.equal(env.body.client.document, "52998224725"); assert.ok(env.body.identifier.startsWith("cal-")); assert.ok(env.body.callbackUrl.endsWith("/api/webhook"));
  assert.ok(!JSON.stringify(r.d).includes("SEC"));
  // Pix: Purchase vai pro Facebook na hora que gera
  let fb = await fbDe(r.d.identifier);
  assert.equal(fb.length, 1); assert.equal(fb[0].event_name, "Purchase"); assert.equal(fb[0].custom_data.value, 50); assert.equal(fb[0].custom_data.currency, "BRL");
  assert.deepEqual(fb[0].user_data.em, [sha("maria@teste.com")]); assert.deepEqual(fb[0].user_data.ph, [sha("5511988887777")]); assert.deepEqual(fb[0].user_data.fn, [sha("maria")]);
  assert.equal((await post("/api/pix", { ...base, extras: ["presente"] })).s, 400);
  assert.equal((await post("/api/pix", { ...base, extras: ["inventado"] })).s, 400);
  for (const [v, n] of [[15, "01"], [20, "01"], [29, "01"], [30, "02"], [49, "02"], [50, "03"], [70, "03"], [99, "03"], [100, "04"], [150, "04"], [200, "04"]]) { r = await post("/api/pix", { ...base, valor: v }); assert.equal(r.d.produto, "Calendário " + n, v); }
  for (const v of [14, 201, 0, -5, 20.5, "abc", null]) { r = await post("/api/pix", { ...base, valor: v }); assert.equal(r.s, 400, "valor " + v); }
  assert.equal((await post("/api/pix", { ...base, email: "x" })).s, 400);
  assert.equal((await post("/api/pix", { ...base, telefone: "123" })).s, 400);
  assert.equal((await post("/api/pix", { ...base, nome: "" })).s, 400);
  assert.equal((await post("/api/pix", { ...base, documento: "" })).s, 400);
  assert.equal((await post("/api/pix", { ...base, documento: "111.111.111-11" })).s, 400);
  assert.equal((await post("/api/pix", { ...base, documento: "529.982.247-24" })).s, 400);
  assert.equal((await fetch(B + "/api/pix")).status, 405);
  const pago = { event: "TRANSACTION_PAID", token: "tok123", client: { name: "Maria" }, transaction: { id: "t1", identifier: "cal-1", status: "COMPLETED", amount: 50 }, orderItems: [{ product: { name: "Calendário 03" } }] };
  assert.equal((await post("/api/webhook", pago)).s, 200);
  assert.equal((await post("/api/webhook", { ...pago, token: "errado" })).s, 401);
  assert.equal((await post("/api/webhook", { event: "TRANSACTION_PAID" })).s, 401);
  assert.equal((await fetch(B + "/api/status?id=t1abcdef").then(x => x.json())).status, "PENDING");
  assert.equal((await fetch(B + "/api/status?id=../x")).status, 400);
  await fetch(B + "/__pagar");
  assert.equal((await fetch(B + "/api/status?id=t1abcdef").then(x => x.json())).status, "COMPLETED");
  // cartão
  const cc = { ...base, nome: "Maria Souza", parcelas: 1, endereco: { cep: "01310-100", rua: "Av Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "sp" }, cartao: { numero: "4111 1111 1111 1111", nome: "maria souza", validade: "12/30", cvv: "123" } };
  r = await post("/api/cartao", cc);
  assert.equal(r.s, 200, JSON.stringify(r.d)); assert.equal(r.d.status, "pago"); assert.equal(r.d.produto, "Calendário 03"); assert.equal(r.d.transactionId, "c1abcdef");
  const ec = (await recebidos()).filter(x => x.url === "/api/v1/gateway/card/receive").pop();
  fb = await fbDe(r.d.identifier); assert.equal(fb.length, 1, "cartão aprovado manda Purchase"); assert.deepEqual(fb[0].user_data.ln, [sha("souza")]); assert.deepEqual(fb[0].user_data.ct, [sha("saopaulo")]);
  assert.equal(ec.url, "/api/v1/gateway/card/receive");
  assert.deepEqual(ec.body.card, { number: "4111111111111111", owner: "MARIA SOUZA", expiresAt: "2030-12", cvv: "123" });
  assert.equal(ec.body.amount, 50); assert.equal(ec.body.installments, 1); assert.ok(ec.body.clientIp);
  assert.deepEqual(ec.body.client.address, { country: "BR", zipCode: "01310100", state: "SP", city: "São Paulo", neighborhood: "Bela Vista", street: "Av Paulista", number: "1000" });
  assert.ok(!JSON.stringify(r.d).includes("4111"));
  r = await post("/api/cartao", { ...cc, cartao: { ...cc.cartao, numero: "5555555555554444" } }); assert.equal(r.d.status, "analise");
  assert.equal((await fbDe(r.d.identifier)).length, 0, "cartão em análise não manda Purchase");
  assert.equal((await post("/api/webhook", { event: "TRANSACTION_PAID", token: "tok123", client: { name: "Maria Souza", email: "maria@teste.com" }, transaction: { id: "c1", identifier: r.d.identifier, status: "COMPLETED", amount: 50, paymentMethod: "CREDIT_CARD" } })).s, 200);
  assert.equal((await fbDe(r.d.identifier)).length, 1, "cartão aprovado depois manda Purchase pelo webhook");
  assert.equal((await post("/api/webhook", { event: "TRANSACTION_PAID", token: "tok123", client: {}, transaction: { id: "p9", identifier: "cal-pixpago", status: "COMPLETED", amount: 50, paymentMethod: "PIX" } })).s, 200);
  assert.equal((await fbDe("cal-pixpago")).length, 0, "Pix pago não manda de novo");
  const antes = (await recebidos()).filter(x => x.url.startsWith("/v25.0/")).length;
  r = await post("/api/cartao", { ...cc, cartao: { ...cc.cartao, numero: "4000000000000002" } }); assert.equal(r.s, 402); assert.equal(r.d.status, "recusado");
  assert.equal((await recebidos()).filter(x => x.url.startsWith("/v25.0/")).length, antes, "cartão recusado não manda Purchase");
  for (const [k, v] of [["numero", "4111111111111112"], ["numero", "4111"], ["validade", "01/20"], ["validade", "13/30"], ["cvv", "1"], ["nome", "ab"]]) assert.equal((await post("/api/cartao", { ...cc, cartao: { ...cc.cartao, [k]: v } })).s, 400, k + " " + v);
  for (const [k, v] of [["cep", "123"], ["uf", "XX"], ["rua", ""], ["numero", ""]]) assert.equal((await post("/api/cartao", { ...cc, endereco: { ...cc.endereco, [k]: v } })).s, 400, k + " " + v);
  assert.equal((await post("/api/cartao", { ...cc, parcelas: 2 })).s, 400);
  assert.equal((await post("/api/cartao", { ...cc, documento: "111.111.111-11" })).s, 400);
  assert.equal((await post("/api/cartao", { ...cc, valor: 201 })).s, 400);
  assert.equal((await fetch(B + "/api/cartao")).status, 405);
  console.log("API ok");
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1); });
