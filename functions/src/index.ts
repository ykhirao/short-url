import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as express from 'express';
import * as admin from 'firebase-admin';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
admin.initializeApp();
const db = admin.firestore();
const LINKS_COL = db.collection('links');
const USERS_COL = db.collection('users');

const {
  NODE_ENV,
  FUNCTIONS_EMULATOR,
  FIREBASE_DEBUG_MODE,
  GCLOUD_PROJECT,
} = process.env;
const isDevelopment = NODE_ENV === 'development' || FUNCTIONS_EMULATOR === 'true' || FIREBASE_DEBUG_MODE === 'true';

const NOT_EXISTS_URL = 'https://google.com'; // リンク切れなど自社のHPなどに飛ばす場合はここを変更
const CACHE_CONTROL_TIME = isDevelopment ? 0 : 300; // 本番は5分間キャッシュさせる
const REDIRECT_TIME = isDevelopment ? 3 : 0; // 本番はリダイレクトまで0秒
const BASE_URL = isDevelopment ? `http://localhost:5002` : `https://${GCLOUD_PROJECT}.web.app`;

type LinkDocType = {
  url?: string;
  ogps?: string[];
}

/** Adminユーザーの初期化 */
const initAdminFunc = async (_req: express.Request, res: express.Response) => {
  const adminDoc = USERS_COL.doc('admin');
  const user = await adminDoc.get();
  if (user.exists) {
    res.send('Already initialized');
  } else {
    // Tokenの強さはお好みで変更お願いします。
    // Link作成時にヘッダーの `Authorization: Bearer <token>` で認証する
    const token = require('crypto').randomBytes(48).toString('hex');
    await adminDoc.set({ name: 'admin', token });
    res.send('Initialized!');
  }
}

/** リダイレクト処理 */
const redirectFunc = async (req: express.Request, res: express.Response): Promise<any> => {
  const id = req.params.id || '0';
  const record = await LINKS_COL.doc(id).get();
  const data = { id: record.id, ...record.data() } as LinkDocType;

  const url = data?.url || NOT_EXISTS_URL;
  if (!url) return res.status(404).send('Not Found');

  const ogps = (data?.ogps || []).map(ogp => ogp).join('\n');

  // レスポンスは5分間キャッシュさせる
  res.set("Cache-Control", `public, max-age=${CACHE_CONTROL_TIME}`)
  res.send(`
  <!DOCTYPE html>
  <html lang="ja">
  <head prefix="og: https://ogp.me/ns#">
    <title>Redirect...</title>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="${REDIRECT_TIME};URL='${url}'" />
    <meta name="robots" content="noindex" />
    ${ogps}
  </head>
  <body>
    <!--
      <noscript>
        Redirect: <a href="${url}"> ${url} </a>
      </noscript>
      <script>
        window.location = "${url}";
      </script>
    -->
  </body>
  </html>
  `);
}

/** Link作成API */
const createFunc = async (req: express.Request, res: express.Response): Promise<any> => {
  logger.info(req.body, { structuredData: true });

  // Adminが作成されてなければエラー
  const admin = await USERS_COL.doc('admin').get();
  if (!admin.exists) return res.status(404).send('Not Found: Admin user is not initialized');

  // Bearer Tokenがなければ認証エラー
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token == null) return res.status(401).send('Unauthorized: token is required');

  // Bodyのパース等
  const { id: reqId, url, ogps = [] } = req.body;

  // URLの存在チェック
  if (url == null) return res.status(400).send('Bad Request: url is required');

  const id = reqId || Math.random().toString(32).substring(2);

  // AdminのTokenとBearer Tokenが同じでなければエラー
  const adminToken = admin.data()?.token;
  if (token !== adminToken) return res.status(401).send(`Unauthorized: token is not valid`);

  const ref = LINKS_COL.doc(id);
  const record = await ref.get();

  // 該当IDのレコードがすでに存在していればエラー
  if (record.exists) return res.status(403).send(`Already exists: ${id}`);

  await ref.set({
    id,
    url,
    ogps,
  });

  res.status(200).send(`OK, created ${id}: ${BASE_URL}/s/${id} `);
}

// Hoting用のルーティング
// http://127.0.0.1:5002/s
app.get('/s', (_req, res) => res.send(404));
app.get('/s/users/init', initAdminFunc);
app.post('/s/users/init', initAdminFunc);
app.post('/s/links', createFunc);
app.get('/s/:id', redirectFunc);

// Functions側のルーティング, /s をrootとする
// http://127.0.0.1:5001/{_YOUR PROJECT_ID_}/us-central1/s → app.get('/', ()=>{})
// app.get('/', (_req, res) => res.send(404));

export const s = onRequest(app);
