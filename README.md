# Notion to Nanobanana Pro Chrome Extension

NotionのブロックテキストからGemini Nanobanana Proで画像を生成し、自動的にNotionページに追加するChrome拡張機能です。

## 🌟 機能

- ✨ Notionページ上でテキストブロックを選択するだけで画像生成
- 🤖 Gemini Nanobanana Pro APIを使用した高品質な画像生成
- 🔄 生成された画像を自動的にNotionページに追加
- 🎨 直感的なUIと簡単な設定
- 🔐 APIキーはブラウザのローカルストレージに安全に保存
- 🚀 **Notionインテグレーション不要！** - Gemini API keyだけでOK

## 📋 前提条件

**Gemini API Keyのみ必要です！**

- [Google AI Studio](https://makersuite.google.com/app/apikey)でAPIキーを取得
- Nanobanana Pro APIへのアクセス権限が必要

> **注意**: Notionインテグレーションやアクセストークンは不要です。拡張機能がブラウザ上で直接Notionページに画像を挿入します。

## 🚀 インストール方法

### 開発者モードでのインストール

1. このリポジトリをクローンまたはダウンロード
   ```bash
   git clone https://github.com/yourusername/Notion-to-nanobananapro-chrome-extension.git
   cd Notion-to-nanobananapro-chrome-extension
   ```

2. Google Chromeを開く

3. アドレスバーに `chrome://extensions/` と入力

4. 右上の「デベロッパーモード」を有効にする

5. 「パッケージ化されていない拡張機能を読み込む」をクリック

6. ダウンロードしたフォルダを選択

7. 拡張機能が読み込まれ、Chromeのツールバーにアイコンが表示されます

## ⚙️ 設定方法

たった2ステップで設定完了！

1. Chromeツールバーの拡張機能アイコンをクリック

2. **Gemini API Key**を入力
   - [Google AI Studio](https://makersuite.google.com/app/apikey)で取得したAPIキーを入力

3. 「保存 (Save)」ボタンをクリック

以上で設定完了です！Notionインテグレーションの作成や接続は不要です。

## 📖 使い方

1. Notionページを開く

2. 画像を生成したいテキストが含まれるブロックを選択
   - マウスでテキストをドラッグして選択

3. 「Generate Image」ボタンが表示されるのでクリック

4. 画像生成が開始されます（数秒〜数十秒かかります）

5. 生成が完了すると、画像が自動的にNotionページに追加されます

6. ページがリロードされ、新しい画像が表示されます

## 💡 使用例

### 例1: 風景画の生成
```
選択するテキスト:
「夕暮れの富士山と桜が咲く湖畔の風景」

→ このテキストを選択して「Generate Image」をクリック
→ 美しい日本の風景画が生成されてNotionに追加されます
```

### 例2: コンセプトアートの生成
```
選択するテキスト:
「近未来的なサイバーパンク都市、ネオンライトと空飛ぶ車」

→ このテキストを選択して「Generate Image」をクリック
→ SF風のコンセプトアートが生成されます
```

## 🛠️ 技術スタック

- **Manifest V3** - 最新のChrome拡張機能仕様
- **Vanilla JavaScript** - フレームワーク不要のシンプルな実装
- **Chrome Storage API** - APIキーの安全な保存
- **Gemini Nanobanana Pro API** - 画像生成
- **DOM Manipulation** - ブラウザ上で直接Notionページに画像を挿入

## 📁 プロジェクト構造

```
.
├── manifest.json          # 拡張機能の設定ファイル
├── background.js          # バックグラウンドサービスワーカー
├── content.js             # Notionページで動作するスクリプト
├── content.css            # コンテンツスクリプトのスタイル
├── popup.html             # 設定画面のHTML
├── popup.js               # 設定画面のロジック
├── popup.css              # 設定画面のスタイル
├── icons/                 # 拡張機能のアイコン
│   └── README.md          # アイコンの説明
└── README.md              # このファイル
```

## 🔧 API設定の詳細

### Gemini API Key の取得

1. [Google AI Studio](https://makersuite.google.com/app/apikey)にアクセス
2. Googleアカウントでサインイン
3. "Create API Key"をクリック
4. 生成されたAPIキーをコピー
5. 拡張機能の設定画面に貼り付け

これだけで準備完了です！

## 🐛 トラブルシューティング

### 画像が生成されない

- Gemini APIキーが正しく設定されているか確認
- インターネット接続を確認
- Chromeのデベロッパーツール（F12）でエラーメッセージを確認
- API使用制限に達していないか確認

### 画像がNotionページに表示されない

- ページをリロードしてみる
- ブラウザのコンソール（F12）でエラーを確認
- 画像URLが有効か確認

### 「Generate Image」ボタンが表示されない

- Notionページ（`*.notion.so`）を開いているか確認
- テキストを選択しているか確認
- 拡張機能が有効になっているか確認（`chrome://extensions/`）
- ページをリロードしてみる

## 📝 注意事項

- Gemini APIには使用量制限がある場合があります
- 生成される画像の品質はプロンプト（選択したテキスト）の詳細さに依存します
- 大量のリクエストを短時間に送信するとAPI制限に達する可能性があります
- 画像はNotionのDOMに直接挿入されます（Notion APIは使用しません）
- ページをリロードすると挿入した画像は消える可能性があります（Notionの保存機能に依存）

## 🤝 コントリビューション

プルリクエストを歓迎します！大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 📄 ライセンス

MIT License

## 🔗 リンク

- [Gemini API Documentation](https://ai.google.dev/docs)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Google AI Studio](https://makersuite.google.com/app/apikey)

## ✨ 今後の改善予定

- [ ] 画像スタイルのカスタマイズオプション
- [ ] 複数画像の一括生成
- [ ] 生成履歴の表示
- [ ] プロンプトテンプレート機能
- [ ] 画像サイズ・アスペクト比の選択
- [ ] ダークモード対応

---

Made with ❤️ for Notion & Gemini users
