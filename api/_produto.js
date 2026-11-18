// Nome do produto enviado pra AmploPay, de acordo com o valor.
// Mude as faixas aqui se quiser.
const VALOR_MIN = 15, VALOR_MAX = 200;
const FAIXAS = [
  { ate: 29,  id: "calendario-01", nome: "Calendário 01" },
  { ate: 49,  id: "calendario-02", nome: "Calendário 02" },
  { ate: 99,  id: "calendario-03", nome: "Calendário 03" },
  { ate: 200, id: "calendario-04", nome: "Calendário 04" },
];
// Ofertas extras do checkout. Os mesmos ids e valores ficam no CONFIG.bumps do index.html.
const BUMPS = [
  { id: "presente", nome: "Calendário extra (presente)", valor: 30 },
];
function produtoPorValor(v) { return FAIXAS.find(f => v <= f.ate); }
module.exports = { VALOR_MIN, VALOR_MAX, BUMPS, produtoPorValor };
