// GitHub repo secret'larini .env'den okuyup ayarlar (degerler ekrana basilmaz)
// node --env-file=<trendyol-bot/.env yolu> set-secrets.mjs <owner/repo>
import { execFileSync } from "node:child_process";
const repo = process.argv[2];
if (!repo) { console.error("Kullanim: ... set-secrets.mjs owner/repo"); process.exit(1); }
const names = ["TRENDYOL_SELLER_ID", "TRENDYOL_API_KEY", "TRENDYOL_API_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
for (const n of names) {
  const v = (process.env[n] || "").trim();
  if (!v || v.includes("BURAYA") || v.includes("OTOMATIK")) { console.error("EKSIK:", n); process.exit(1); }
  execFileSync("gh", ["secret", "set", n, "--repo", repo, "--body", v], { stdio: ["ignore", "inherit", "inherit"] });
  console.log("ayarlandi:", n);
}
console.log("Tum secret'lar ayarlandi.");
