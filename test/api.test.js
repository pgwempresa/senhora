// Testa as rotas /api com a AmploPay falsa. Uso: node test/servidor.js (em outro terminal) e depois node test/api.test.js
const assert = require("assert");
const B = "http://localhost:4100";
const post = (p, b) => fetch(B + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async r => ({ s: r.status, d: await r.json() }));
const base = { valor: 50, nome: "Maria", email: "maria@teste.com", telefone: "(11) 9 8888-7777", documento: "529.982.247-25" };
(async () => {
  let r = await post("/api/pix", base);
  assert.equal(r.s, 200); assert.ok(r.d.pix.code); assert.equal(r.d.produto, "Calendário 03");
  const rec = await fetch(B + "/__recebidos").then(x => x.json());
  const env = rec[rec.length - 1];
  assert.equal(env.url, "/api/v1/gateway/pix/receive"); assert.equal(env.headers["x-public-key"], "PUB"); assert.equal(env.headers["x-secret-key"], "SEC");
  assert.equal(env.body.amount, 50); assert.equal(env.body.products[0].name, "Calendário 03"); assert.equal(env.body.products[0].price, 50);
  assert.equal(env.body.client.phone, "11988887777"); assert.equal(env.body.client.document, "52998224725"); assert.ok(env.body.identifier.startsWith("cal-")); assert.ok(env.body.callbackUrl.endsWith("/api/webhook"));
  assert.ok(!JSON.stringify(r.d).includes("SEC"));
  for (const [v, n] of [[15, "01"], [29, "01"], [30, "02"], [49, "02"], [50, "03"], [99, "03"], [100, "04"], [200, "04"]]) { r = await post("/api/pix", { ...base, valor: v }); assert.equal(r.d.produto, "Calendário " + n, v); }
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
  console.log("API ok");
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1); });
