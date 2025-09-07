// post-cat.js (short caption edition)
// TheCatAPI の画像を X に投稿。短文キャプション＋重複防止。
// 依存: @thatapicompany/thecatapi, twitter-api-v2 / Node.js >= 20

import { TheCatAPI } from "@thatapicompany/thecatapi";
import { TwitterApi, EUploadMimeType } from "twitter-api-v2";
import fs from "node:fs";

const {
  CAT_API_KEY,
  TWITTER_APP_KEY,
  TWITTER_APP_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  DRY_RUN,
  CAT_API_HOST,          // 例: "https://api.thedogapi.com/v1"（任意）
  CAPTION_TAGS = "#TheCatAPI", // 空文字にすればハッシュタグ無しにもできる
} = process.env;

// ---------- utils ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isTrue = (v) => String(v).toLowerCase() === "true";

// ---------- 短文用語彙 ----------
const NOUN = ["猫", "ねこ", "にゃんこ"];
const SCENE = ["窓辺", "日だまり", "机上", "ソファ", "床", "影", "朝", "昼", "夕方", "夜"];
const VERB = ["待機", "充電", "休憩", "鎮座", "見守り", "ねむる", "のび", "ごろり"];
const ADJ  = ["やわらか", "静か", "のんびり", "凛々", "ふわふわ", "まったり", "すやすや", "きゅるん"];
const EMO  = ["😺","🐾","🐱","✨","💤"];

// ---------- 短文テンプレ（10〜15字前後を狙う） ----------
const TEMPLATES = [
  ({n,a})         => `${a}${n}`,
  ({n,s})         => `${s}の${n}`,
  ({n,v})         => `${n}${v}`,
  ({n})           => `本日の${n}`,
  ({n})           => `${n}の時間`,
  ({n})           => `${n}速報`,
  ({n})           => `${n}通信`,
  ({n})           => `${n}助かる`,
  ({n})           => `${n}、います`,
  ({n})           => `${n}、よし`,
  ({n,s})         => `${s}で${n}`,
  ({n,a})         => `${n}、${a}`,
];

// ---------- 重複防止（履歴保存） ----------
const STATE_DIR = ".state";
const USED_PATH = `${STATE_DIR}/used_captions.json`;

function loadUsed() {
  try { return new Set(JSON.parse(fs.readFileSync(USED_PATH, "utf8"))); }
  catch { return new Set(); }
}
function saveUsed(set) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const arr = Array.from(set).slice(-5000); // 直近5000件
  fs.writeFileSync(USED_PATH, JSON.stringify(arr, null, 2));
}
const used = loadUsed();

function generateShortCaptionUnique() {
  for (let i = 0; i < 50; i++) {
    const core = choice(TEMPLATES)({
      n: choice(NOUN),
      s: choice(SCENE),
      v: choice(VERB),
      a: choice(ADJ),
    });

    // 20%で絵文字を1つだけ付ける（付けすぎない）
    const withEmoji = Math.random() < 0.2 ? `${core} ${choice(EMO)}` : core;

    // タグは環境変数で切替可能（既定 #TheCatAPI）
    const caption = CAPTION_TAGS
      ? `${withEmoji} ${CAPTION_TAGS}`.trim()
      : withEmoji.trim();

    // 短めを維持
    if (caption.length > 60) continue;

    if (!used.has(caption)) {
      used.add(caption);
      return caption;
    }
  }

  // 最後の保険：必ずユニークに
  const fallback = `本日の猫 ${Date.now().toString().slice(-4)} ${CAPTION_TAGS}`.trim();
  used.add(fallback);
  return fallback;
}

// ---------- MIME ----------
function pickMimeType(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return EUploadMimeType.Png;
  if (ct.includes("jpeg") || ct.includes("jpg")) return EUploadMimeType.Jpeg;
  if (ct.includes("gif")) return EUploadMimeType.Gif;
  if (ct.includes("webp")) return EUploadMimeType.Webp;
  return EUploadMimeType.Jpeg;
}

// ---------- main ----------
for (const k of [
  "CAT_API_KEY","TWITTER_APP_KEY","TWITTER_APP_SECRET",
  "TWITTER_ACCESS_TOKEN","TWITTER_ACCESS_SECRET",
]) {
  if (!process.env[k]) throw new Error(`Missing environment variable: ${k}`);
}

const cat = new TheCatAPI(CAT_API_KEY, CAT_API_HOST ? { host: CAT_API_HOST } : undefined);
const twitter = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

async function main() {
  const me = await twitter.v2.me();
  const username = me?.data?.username || "unknown";
  console.log(`Auth OK: @${username}`);

  // 画像取得（軽リトライ）
  let img;
  for (let i = 0; i < 3; i++) {
    try {
      const list = await cat.images.searchImages({ limit: 1 });
      img = list && list[0];
      if (img?.url) break;
    } catch (e) {
      if (i === 2) throw e;
      await sleep(300 * (i + 1));
    }
  }
  if (!img?.url) throw new Error("No image URL from TheCatAPI");
  console.log("Image:", img.url);

  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = pickMimeType(res.headers.get("content-type"));

  if (isTrue(DRY_RUN)) {
    console.log("🔎 DRY RUN: 認証＆画像取得のみ。ツイートは実行しません。");
    return;
  }

  // アップロード → ALT → 投稿
  const mediaId = await twitter.v1.uploadMedia(buf, { mimeType });
  try {
    await twitter.v1.createMediaMetadata(mediaId, {
      alt_text: { text: `Cat photo via TheCatAPI (id: ${img.id || "n/a"})` },
    });
  } catch {}

  const caption = generateShortCaptionUnique();
  const tw = await twitter.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });

  const tweetId = tw?.data?.id;
  if (!tweetId) throw new Error("Tweet succeeded but no id returned");

  console.log("📝 Caption:", caption);
  console.log("✅ Tweet ID:", tweetId);
  console.log("🔗 Tweet URL:", `https://x.com/${username}/status/${tweetId}`);
  console.log("✅ Posted:", img.url);

  // 履歴保存（次回以降の重複を防ぐ）
  saveUsed(used);
}

main().catch((e) => {
  console.error("❌ Post failed:", e?.stack || e);
  process.exit(1);
});
