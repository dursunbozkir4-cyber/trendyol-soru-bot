// Bulut versiyon: eslestir + Telegram'a gonder (GitHub Actions'ta her sabah calisir)
const sellerId = process.env.TRENDYOL_SELLER_ID;
const auth = Buffer.from(`${process.env.TRENDYOL_API_KEY}:${process.env.TRENDYOL_API_SECRET}`).toString("base64");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const base = "https://apigw.trendyol.com/integration";
const H = { Authorization: `Basic ${auth}`, "User-Agent": `${sellerId} - SelfIntegration`, Accept: "application/json" };
const get = async u => { const r = await fetch(u, { headers: H }); const t = await r.text(); if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${t.slice(0,150)}`); return JSON.parse(t); };

async function tgSend(text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
  });
}
async function tgDoc(filename, content) {
  const fd = new FormData();
  fd.append("chat_id", String(TG_CHAT));
  fd.append("document", new Blob([content], { type: "text/plain" }), filename);
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendDocument`, { method: "POST", body: fd });
}

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
  const windows = Math.ceil((daysBack * 86400000) / win);
  for (let w = 0; w < windows; w++) {
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

try {
  const questions = await allWaiting();
  const orders = await recentOrders();
  const byCust = new Map(), byNo = new Map(), byCargo = new Map();
  for (const o of orders) {
    const k = String(o.customerId);
    (byCust.get(k) || byCust.set(k, []).get(k)).push(o);
    byNo.set(String(o.orderNumber), o); byCargo.set(String(o.cargoTrackingNumber), o);
  }
  const matched = [], unmatched = [];
  for (const q of questions) {
    const h = extractHints(q.text);
    let order = (byCust.get(String(q.customerId)) || [])[0] || null;
    let how = order ? "customerId" : null;
    if (!order && h.orderNo) { order = byNo.get(h.orderNo) || byCargo.get(h.orderNo) || null; if (order) how = "metindeki no"; }
    const row = { urun: q.productName, soru: q.text, isim: h.possibleName || "", link: q.webUrl || "" };
    if (order) matched.push({ ...row, how, no: order.orderNumber, musteri: `${order.customerFirstName} ${order.customerLastName}`, kargo: order.cargoTrackingNumber || "", durum: order.shipmentPackageStatus || "" });
    else unmatched.push(row);
  }

  const today = new Date().toLocaleDateString("tr-TR");
  let msg = `📦 Trendyol Soru Raporu — ${today}\n\nBekleyen: ${questions.length}\n✅ Siparişle eşleşen: ${matched.length}\n❓ Eşleşmeyen (sipariş no yok): ${unmatched.length}`;
  if (matched.length) {
    msg += `\n\n— ÖNCELİKLİ (siparişli) —`;
    matched.slice(0, 10).forEach((m, i) => {
      msg += `\n\n${i + 1}. ${m.urun.slice(0, 45)}\nSoru: ${m.soru.slice(0, 120)}\nİsim: ${m.isim || "-"}\nSipariş: ${m.no} · ${m.musteri}\nDurum: ${m.durum}\n${m.link}`;
    });
    if (matched.length > 10) msg += `\n\n... +${matched.length - 10} tane daha (dosyada).`;
  }
  if (msg.length > 4000) msg = msg.slice(0, 3990) + "\n…(devamı dosyada)";
  await tgSend(msg);

  const rep =
`TRENDYOL SORU RAPORU - ${today}
Bekleyen: ${questions.length} | Eslesen: ${matched.length} | Eslesmeyen: ${unmatched.length}

=== ESLESEN (oncelikli) ===
${matched.map((m, i) => `${i + 1}. ${m.urun}\n  Soru: ${m.soru}\n  Olasi isim: ${m.isim || "-"}\n  Eslesme: ${m.how} | Siparis: ${m.no} | Musteri: ${m.musteri} | Kargo: ${m.kargo} | Durum: ${m.durum}\n  Cevapla: ${m.link}`).join("\n\n") || "(yok)"}

=== ESLESMEYEN (siparis no yok) ===
${unmatched.map((m, i) => `${i + 1}. ${m.urun}\n  Soru: ${m.soru}\n  Cevapla: ${m.link}`).join("\n\n") || "(yok)"}
`;
  if (questions.length) await tgDoc(`trendyol-sorular-${new Date().toISOString().slice(0,10)}.txt`, rep);
  console.log("Gonderildi. Bekleyen:", questions.length, "Eslesen:", matched.length);
} catch (e) {
  await tgSend(`⚠️ Trendyol soru raporu HATA verdi:\n${String(e).slice(0, 300)}`);
  console.error(e); process.exit(1);
}
