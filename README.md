# つなぐちゃん 受付AIプロトタイプ

BST受付AI「つなぐちゃん」の確認用Webプロトタイプです。

## 公開方法

無料でURL共有する場合は、GitHub Pagesでの公開を想定しています。

1. GitHubで新しいリポジトリを作成する
2. このフォルダの内容をリポジトリへアップロードする
3. リポジトリの `Settings` → `Pages` を開く
4. `Deploy from a branch` を選び、`main` / root を公開元にする
5. 数分後に `https://ユーザー名.github.io/リポジトリ名/` で確認する

## 公開対象ファイル

- `index.html`
- `styles.css`
- `src/app.js`
- `assets/face-parts/`
- `bst-latest-0701.glb`
- `haikei.mp4`
- `.nojekyll`

`reference/` は制作時の参考資料なので、公開対象から外しています。

## 注意

このプロトタイプはフロントエンドだけで動く確認用です。編集ロックは簡易的なものなので、本番運用ではサーバー側の認証や管理画面分離に置き換えてください。
