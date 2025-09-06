import { TheCatAPI } from "@thatapicompany/thecatapi";
import { TwitterApi } from "twitter-api-v2";

const {
  CAT_API_KEY,
  TWITTER_APP_KEY,
  TWITTER_APP_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  DRY_RUN, // "true" のとき投稿しない
} = process.env;

for (const k of [
  "CAT_API_KEY",
  "TWITTER_APP_KEY",
  "TWITTER_APP_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_SECRET",
]) {
  if (!process.env[k]) throw new Error(`${k} is missing`);
}

const cat = new TheCatAPI(CAT_API_KEY);
const twitter = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

const captions = ["今日の猫😺", "にゃんこ休憩🐾", "Cat break🐱", "もふもふ補給🐾"];

async function main() {
  // 資格情報の健全性確認（ユーザー取得）
  const me = await twitter.v2.me();
  console.log(`Auth OK: @${me.data?.username}`);

  // 画像1枚取得
  const [img] = await cat.images.searchImages({ limit: 1 });
  if (!img?.url) throw new Error("No image URL from Cat API");
  console.log("Image:", img.url);

  // DRY RUN: ここで終了（投稿しない）
  const dry = String(DRY_RUN).toLowerCase() === "true";
  if (dry) {
    console.log("🔎 DRY RUN: 画像取得と認証のみ。ツイートは実行しません。");
    return;
  }

  // 画像を取得してアップロード → ツイート
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const ct = res.headers.get("content-type") || "";
  const isPng = ct.includes("png");
  const mediaId = await twitter.v1.uploadMedia(buf, { type: isPng ? "png" : "jpg" });

  // 重複回避のために時刻トークンを末尾に付与
  const token = new Date().toISOString().slice(11, 16).replace(":", ""); // HHmm
  const caption = `${captions[Math.floor(Math.random() * captions.length)]} #TheCatAPI ${token}`;

  await twitter.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });
  console.log("✅ Posted:", img.url);
}

main().catch((e) => {
  console.error("❌ Post failed:", e);
  process.exit(1);
});
