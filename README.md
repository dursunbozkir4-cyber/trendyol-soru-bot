# Trendyol Soru Raporu (otomatik)

Her sabah 07:00'de (TR) Trendyol müşteri sorularını çeker, siparişlerle `customerId` üzerinden eşleştirir ve özeti + tam raporu Telegram'a gönderir.

- `matcher-cloud.mjs` — ana iş.
- `.github/workflows/daily.yml` — GitHub Actions zamanlama (`workflow_dispatch` ile elle de çalışır).
- Gizli anahtarlar repo **Secrets** içinde (kodda değil).

Eşleşmeyenler (sipariş no/isim yok) ayrı listelenir; oto-cevap kapalı (sonra açılacak).
