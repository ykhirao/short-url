# short-url

URLを短縮するWebサービスです。

Firebase, Firestore, Cloud Functions, Node.js, TypeScript, JavaScript, HTTPなどの知識が必要ですが、簡単に自作の短縮URLサービスが作れます。

## 使い方

```bash
# 複数ターミナルで以下、同時起動する
$ firebase emulators:start
$ npm run build:watch
```

* http://127.0.0.1:4000/ でEmulatorUIが起動する
* Firestore, Hosting, Firestore も同時に立ち上がる(PortはEmulatorUI上で確認をする)
* fireabase.jsonでhostiongのrewriteをfunctionsに向けたので以下URLが同じ動作すればOK
* functions(http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/s) → hosting(http://127.0.0.1:5002/s)

## httpファイルの使い方

```bash
$ cp request.http.copy request.http
```

VSCodeのRestClient拡張を使う前提です。
その他Curlなどでも代用できるので自分の使いやすいスクリプトを組んでください。

token等を万が一にもコミットしないように request.http は.gitignoreに設定してます

ローカルPCからのLink作成はBearer token認証を利用します。

ある程度強度はあると思います(initAdminFunc)が、必要があればもっと強度の強いTokenを自作してください。

操作の流れ

* request.httpの `@project_id` を設定する
* request.http から `/s/users/init` を叩く
* [Firestore](https://console.firebase.google.com/) の /users/admin からTokenをコピー
* request.http の `@production_token` にペーストする
* コンテンツ作成 `POST {{production_url}}/s/links` を叩く
