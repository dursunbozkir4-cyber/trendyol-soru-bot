// ANLIK: yeni cevap-bekleyen sorulari tek tek Telegram'a gonderir (her 5 dk).
// Daha once bildirilenleri notified.json'da tutar, tekrar gondermez.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const sellerId = process.env.TRENDYOL_SELLER_ID;
const auth = Buffer.from(`${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`).toString("base64");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const base = "https://apigw.trendyol.com/integration";
const H = { Authorization: `Basic ${auth}`, "User-Agent": `${sellerId} - SelfIntegration`, Accept: "application/json" };
const get = async u => { const r = await fetch(u, { headers: H }); const t = await r.text(); if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${t.slice(0,150)}`); return JSON.parse(t); };
const tg = async text => { await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }) }); };

// HTML parse_mode icin metni kacir (& < > Telegram'i bozar)
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// uzun urun adini kisalt
const kisa = (s, n = 45) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
// Trendyol kargo durumu -> Turkce
const DURUM = { Created: "Hazırlanıyor", Picking: "Hazırlanıyor", Invoiced: "Faturalandı", Shipped: "Kargoda", AtCollectionPoint: "Şubede", AtBranch: "Şubede", Delivered: "Teslim edildi", Undelivered: "Teslim edilemedi", Cancelled: "İptal", UnSupplied: "Tedarik edilemedi", Returned: "İade", Repack: "Yeniden paketleme" };
const trDurum = s => DURUM[s] || s || "—";

async function allWaiting() {
  const out = [];
  for (let p = 0; p < 50; p++) {
    const d = await get(`${base}/qna/sellers/${sellerId}/questions/filter?status=WAITING_FOR_ANSWER&page=${p}&size=50`);
    out.push(...(d.content || []));
    if (!d.content?.length || p >= d.totalPages - 1) break;
  }
  return out;
}
async function recentOrders(daysBack = 168) {
  const out = [], now = Date.now(), win = 1000 * 60 * 60 * 24 * 14;
  for (let w = 0; w < Math.ceil((daysBack * 86400000) / win); w++) {
    const end = now - w * win, start = end - win;
    for (let p = 0; p < 100; p++) {
      const d = await get(`${base}/order/sellers/${sellerId}/orders?startDate=${start}&endDate=${end}&page=${p}&size=200`);
      out.push(...(d.content || []));
      if (!d.content?.length || p >= d.totalPages - 1) break;
    }
  }
  return out;
}
function extractHints(text) {
  const t = text || "";
  const orderNo = (t.match(/\b\d{10,}\b/) || [])[0] || null;
  const nameQ = (t.match(/["'“”]([A-Za-zÇĞİÖŞÜçğıöşü ]{3,40})["'“”]/) || [])[1] || null;
  const nameKw = (t.match(/(?:isim|ismi|yaz[iı]l|kaz[iı]|yazd[iı]r)[^A-Za-zÇĞİÖŞÜçğıöşü]{0,8}([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?: [A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?)/) || [])[1] || null;
  return { orderNo, possibleName: nameQ || nameKw || null };
}

const FILE = "notified.json";
const notified = new Set(existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : []);

const questions = await allWaiting();
const fresh = questions.filter(q => !notified.has(String(q.id)));

if (fresh.length === 0) {
  console.log("Yeni soru yok. Bekleyen:", questions.length);
  process.exit(0);
}

const orders = await recentOrders();
const byCust = new Map(), byNo = new Map(), byCargo = new Map();
for (const o of orders) {
  const k = String(o.customerId);
  (byCust.get(k) || byCust.set(k, []).get(k)).push(o);
  byNo.set(String(o.orderNumber), o); byCargo.set(String(o.cargoTrackingNumber), o);
}

for (const q of fresh) {
  const h = extractHints(q.text);
  let order = (byCust.get(String(q.customerId)) || [])[0] || null;
  let how = order ? "customerId" : null;
  if (!order && h.orderNo) { order = byNo.get(h.orderNo) || byCargo.get(h.orderNo) || null; if (order) how = "metindeki no"; }

  let msg = `━━━━━━━━━━\n🆕 <b>YENİ SORU</b>\n\n💬 <b>${esc(q.text)}</b>\n\n📦 Ürün: ${esc(kisa(q.productName))}`;
  if (order) {
    msg += `\n👤 Müşteri: ${esc(order.customerFirstName)} ${esc(order.customerLastName)}`;
    msg += `\n🧾 Sipariş: #${esc(order.orderNumber)}`;
    msg += `\n🚚 Durum: ${esc(trDurum(order.shipmentPackageStatus))}`;
  } else {
    msg += `\n❓ Sipariş bulunamadı (satış öncesi olabilir)`;
  }
  if (q.webUrl) msg += `\n\n👉 <a href="${esc(q.webUrl)}">Cevapla (tıkla)</a>`;
  await tg(msg);
  notified.add(String(q.id));
}

// listeyi guncel tut: sadece hala bekleyenleri sakla (dosya sismesin)
const stillWaiting = new Set(questions.map(q => String(q.id)));
const keep = [...notified].filter(id => stillWaiting.has(id));
writeFileSync(FILE, JSON.stringify(keep));
console.log("Gonderildi:", fresh.length, "| Bekleyen toplam:", questions.length);
