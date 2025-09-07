// post-cat.js
// TheCatAPI の画像を取得して X（Twitter）に投稿。言い回しを巧みに多様化＋重複防止。
// 依存: @thatapicompany/thecatapi, twitter-api-v2  / Node.js >= 20

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
  CAT_API_HOST, // 例: "https://api.thedogapi.com/v1"（任意）
} = process.env;

// ---------- 小道具 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const isTrue = (v) => String(v).toLowerCase() === "true";

// ---------- 語彙（言い回しの材料） ----------
const OPENERS = [
  "休憩のお供に、猫を一匙",
  "気持ちを整える一枚",
  "画面の隅に、やさしい気配",
  "集中が切れる前に、猫の処方箋",
  "本日の看板猫をお届け",
  "世界がざわつく前に深呼吸",
  "作業のBGMに合う猫、見つけました",
  "午後を救うもふもふ速報",
  "心拍数を下げに来た猫です",
  "今日も小さな王さまは健在",
  "猫が通ります。道をあけてください",
  "かわいさでリロード"
];

const SCENES = [
  "窓辺", "机の上", "ひざの上", "日だまり", "廊下の角", "ソファの端",
  "涼しい床", "カーテンの影", "玄関マット", "夕暮れの光", "雨音のそば", "エアコンの風下"
];

const ADVERBS = [
  "しれっと", "堂々と", "こっそり", "誇らしげに", "のびのびと", "気ままに",
  "やわらかく", "静かに", "大胆に", "あくまで自然体で"
];

const VERBS = [
  "見守る", "寝落ちする", "鎮座する", "のびる", "丸まる", "主張する",
  "世界を征服する顔をする", "視線をよこす", "毛づくろいする", "あくびする"
];

const ONE_LINERS = [
  "可愛いの暴力。", "平和はここにあった。", "今日は勝ち。", "尊みが深い。",
  "作業効率、たぶん上がる。", "これは反則。", "語彙力が溶ける。", "秒で癒やす。"
];

const QAS = [
  "問：可愛いは正義？ 答：はい。",
  "問：猫は正義？ 答：つよい。",
  "問：休憩の最適解？ 答：猫。"
];

const CLOSERS = [
  "どうぞ受け取って。", "そっと置いておきます。", "深呼吸してからどうぞ。", "今日も良い日になる。"
];

const HASHTAG_SETS = [
  ["#TheCatAPI", "#猫"], ["#TheCatAPI", "#ねこ"], ["#TheCatAPI", "#CatLovers"],
  ["#TheCatAPI"], ["#TheCatAPI", "#cat"]
];

// ---------- テンプレ群（文構造を変える） ----------
const TEMPLATES = [
  ({op, scene, adv, verb, one, tags}) =>
    `${op} — ${scene}で${adv}${verb}。${one} ${tags}`,
  ({scene, adv, verb, one, tags}) =>
    `ふと${scene}、${adv}${verb}猫。${one} ${tags}`,
  ({op, scene, adv, verb, closer, tags}) =>
    `${op}。${scene}で${adv}${verb}。${closer} ${tags}`,
  ({qa, scene, verb, tags}) =>
    `${qa} ${scene}で${verb}猫の証拠写真。${tags}`,
  ({op, one, tags}) =>
    `${op}。${one} ${tags}`,
  ({scene, adv, verb, closer, tags}) =>
    `${scene}で${adv}${verb}。${closer} ${tags}`,
  ({op, scene, one, tags}) =>
    `${op} — ${scene}編。${one} ${tags}`,
];

// ---------- 重複防止（過去に使った文章を記録） ----------
const STATE_DIR = ".state";
const USED_PATH = `${STATE_DIR}/used_captions.json`;

function loadUsed() {
  try { return new Set(JSON.parse(fs.readFileSync(USED_PATH, "utf8"))); }
  catch { return new Set(); }
}
function saveUsed(set) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const arr = Array.from(set).slice(-5000); // 直近5000件だけ保持
  fs.writeFileSync(USED_PATH, JSON.stringify(arr, null, 2));
}
const usedCaptions = loadUsed();

// 生成 → 未使用なら採用（最大40回まで試行）
function generateCaptionUnique() {
  for (let i = 0; i < 40; i++) {
    const tags = choice(HASHTAG_SETS).join(" ");

    const payload = {
      op: choice(OPENERS),
      scene: choice(SCENES),
      adv: choice(ADVERBS),
      verb: choice(VERBS),
      one: choice(ONE_LINERS),
      qa: choice(QAS),
      closer: choice(CLOSERS),
      tags,
    };

    const caption = choice(TEMPLATES)(payload)
      .replace(/\s+/g, " ")           // 余分な空白を整理
      .replace(/。+/g, "。")           // 句点だぶり整理
      .trim();

    if (!usedCaptions.has(caption) && caption.length <= 260) {
      usedCaptions.add(caption);
      return caption;
    }
  }
  // 最後の手段（必ずユニーク化）
  const fallback = `${choice(OPENERS)}。${choice(ONE_LINERS)} ${choice(HASHTAG_SETS).join(" ")}`;
  usedCaptions.add(fallback);
  return fallback;
}

// ---------- MIME 推定 ----------
function pickMimeType(contentType) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("png")) return EUploadMimeType.Png;
  if (ct.includes("jpeg") || ct.includes("jpg")) return EUploadMimeType.Jpeg;
  if (ct.includes("gif")) return EUploadMimeType.Gif;
  if (ct.includes("webp")) return EUploadMimeType.Webp;
  return EUploadMimeType.Jpeg;
}

// ---------- 本体 ----------
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

  // 画像取得（軽いリトライ付き）
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

  // メディア→ALT→ツイート
  const mediaId = await twitter.v1.uploadMedia(buf, { mimeType });
  try {
    await twitter.v1.createMediaMetadata(mediaId, {
      alt_text: { text: `Cat photo via TheCatAPI (id: ${img.id || "n/a"})` },
    });
  } catch {}

  const caption = generateCaptionUnique();
  const tw = await twitter.v2.tweet({ text: caption, media: { media_ids: [mediaId] } });

  const tweetId = tw?.data?.id;
  if (!tweetId) throw new Error("Tweet succeeded but no id returned");

  // 投稿URL＆状態出力
  console.log("📝 Caption:", caption);
  console.log("✅ Tweet ID:", tweetId);
  const url = `https://x.com/${username}/status/${tweetId}`;
  console.log("🔗 Tweet URL:", url);
  console.log("✅ Posted:", img.url);

  // 重複防止の履歴を保存
  saveUsed(usedCaptions);
}

main().catch((e) => {
  console.error("❌ Post failed:", e?.stack || e);
  process.exit(1);
});
