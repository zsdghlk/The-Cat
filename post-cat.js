// post-cat.js
// TheCatAPI の画像を取得して X（Twitter）に投稿するスクリプト
// - Node.js 20 以降を想定（fetch はグローバルで利用可）
// - 依存: @thatapicompany/thecatapi, twitter-api-v2
// - 環境変数（GitHub Actions から渡す想定）:
//   CAT_API_KEY, TWITTER_APP_KEY, TWITTER_APP_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET, DRY_RUN
//   （任意）CAT_API_HOST を指定すると TheDogAPI 等の互換ホストに切替可能

import { TheCatAPI } from "@thatapicompany/thecatapi";
import { TwitterApi, EUploadMimeType } from "twitter-api-v2";

const {
  CAT_API_KEY,
  TWITTER_APP_KEY,
  TWITTER_APP_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  DRY_RUN,
  CAT_API_HOST, // 例: "https://api.thedogapi.com/v1"（任意）
} = process.env;

// --- 便利関数 --------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isTrue = (v) => String(v).toLowerCase() === "true";

// --- 事前チェック（Actions 側でも Preflight しているが二重で安全） -----
for (const k of [
  "CAT_API_KEY",
  "TWITTER_APP_KEY",
  "TWITTER_APP_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_SECRET",
]) {
  if (!process.env[k]) {
    throw new Error(`Missing environment variable: ${k}`);
  }
}

// --- クライアント初期化 ---------------------------------------------------
const cat = new TheCatAPI(CAT_API_KEY, CAT_API_HOST ? { host: CAT_API_HOST } : undefined);

const twitter = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

// --- キャプション ----------------------------------------------------------
const captions = [
  "今日の猫😺",
  "にゃんこ休憩🐾",
  "Cat break🐱",
  "もふもふ補給🐾",
  "ねこチャージ完了😽",
  "にゃんだふるデイ🐈",
  "かわいいは正義😸",
  "今日も元気にニャー！🐾",
];

function makeCaption() {
  // 重複回避のため時刻トークンを付与（X は本文重複に厳しい）
  const token = new Date().toISOString().slice(11, 16).replace(":", ""); // HHmm
  return `${choice(captions)} #TheCatAPI ${token}`;
}

// --- 画像 MIME 判定（JPG/PNG 想定） ---------------------------------------
function pickMimeType(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return EUploadMimeType.Png;
  if (ct.includes("jpeg") || ct.includes("jpg")) return EUploadMimeType.Jpeg;
  if (ct.includes("gif")) return EUploadMimeType.Gif;
  if (ct.includes("webp")) return EUploadMimeType.Webp;
  // フォールバックは JPEG
  return EUploadMimeType.Jpeg;
}

// --- メイン ----------------------------------------------------------------
async function main() {
  // X 認証確認
  const me = await twitter.v2.me();
  const username = me?.data?.username || "unknown";
  console.log(`Auth OK: @${username}`);

  // TheCatAPI からランダム画像（1枚）
  // 失敗時は数回リトライ
  let img;
  for (let i = 0; i < 3; i++) {
    try {
      const list = await cat.images.searchImages({ limit: 1 });
      img = list && list[0];
      if (img?.url) break;
    } catch (e) {
      if (i === 2) throw e;
      await sleep(500 * (i + 1));
    }
  }
  if (!img?.url) throw new Error("No image URL from TheCatAPI");
  console.log("Image:", img.url);

  // 画像をダウンロード
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = pickMimeType(res.headers.get("content-type"));

  // DRY RUN モードならここで終了（投稿しない）
  if (isTrue(DRY_RUN)) {
    console.log("🔎 DRY RUN: 認証＆画像取得のみ。ツイートは実行しません。");
    return;
  }

  // 画像アップロード → ALT テキスト付与 → ツイート
  const mediaId = await twitter.v1.uploadMedia(buf, { mimeType });
  try {
    await twitter.v1.createMediaMetadata(mediaId, {
      alt_text: { text: `Cat photo via TheCatAPI (id: ${img.id || "n/a"})` },
    });
  } catch {
    // ALT 失敗は致命的ではないので握りつぶす
  }

  const caption = makeCaption();
  const tw = await twitter.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });

  const tweetId = tw?.data?.id;
  if (!tweetId) throw new Error("Tweet succeeded but no id returned");

  const url = `https://x.com/${username}/status/${tweetId}`;
  console.log("✅ Tweet ID:", tweetId);
  console.log("🔗 Tweet URL:", url);
  console.log("✅ Posted:", img.url);
}

// ---------------------------------------------------------------------------
main().catch((e) => {
  console.error("❌ Post failed:", e?.stack || e);
  process.exit(1);
});
