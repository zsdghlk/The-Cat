import { TheCatAPI } from "@thatapicompany/thecatapi";
import { TwitterApi, EUploadMimeType /*, TwitterApiV2Settings*/ } from "twitter-api-v2";
// TwitterApiV2Settings.deprecationWarnings = false; // ※どうしても警告を消したいだけなら有効化

const {
  CAT_API_KEY,
  TWITTER_APP_KEY,
  TWITTER_APP_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
  DRY_RUN,
} = process.env;

const cat = new TheCatAPI(CAT_API_KEY);
const twitter = new TwitterApi({
  appKey: TWITTER_APP_KEY,
  appSecret: TWITTER_APP_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

const captions = ["今日の猫😺", "にゃんこ休憩🐾", "Cat break🐱", "もふもふ補給🐾"];

async function main() {
  const me = await twitter.v2.me();
  console.log(`Auth OK: @${me.data?.username}`);

  const [img] = await cat.images.searchImages({ limit: 1 });
  if (!img?.url) throw new Error("No image URL from Cat API");
  console.log("Image:", img.url);

  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // ← ここを mimeType 方式に変更
  const ct = (res.headers.get("content-type") || "image/jpeg").toLowerCase();
  const mime = ct.includes("png") ? EUploadMimeType.Png : EUploadMimeType.Jpeg;

  if (String(DRY_RUN).toLowerCase() === "true") {
    console.log("🔎 DRY RUN: 認証＆画像取得のみ。ツイートは実行しません。");
    return;
  }

  const mediaId = await twitter.v1.uploadMedia(buf, { mimeType: mime });

  // ALTテキスト（アクセシビリティ向上）
  try {
    await twitter.v1.createMediaMetadata(mediaId, {
      alt_text: { text: `Cat photo via TheCatAPI (id: ${img.id})` },
    });
  } catch (_) {}

  const token = new Date().toISOString().slice(11, 16).replace(":", ""); // HHmm（重複回避）
  const caption = `${captions[Math.floor(Math.random() * captions.length)]} #TheCatAPI ${token}`;

  await twitter.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });
  console.log("✅ Posted:", img.url);
}

main().catch((e) => {
  console.error("❌ Post failed:", e);
  process.exit(1);
});
