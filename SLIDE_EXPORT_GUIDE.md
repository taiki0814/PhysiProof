# PhysiProof スライド変換・エクスポートガイド (Marp to PPTX/PDF/Google Slides)

Marp (Markdown) で作成したスライドファイル `presentation.md` を、PowerPoint、PDF、およびGoogleスライドに変換・エクスポートするための手順書です。

---

## 1. VS Code 上でプレビューする（一番簡単な確認方法）

VS Code の拡張機能を使用すると、エディタ上でリアルタイムにスライドの見た目を確認できます。

1. VS Code の拡張機能マーケットプレイスで **「Marp for VS Code」** を検索してインストールします。
2. `presentation.md` を開きます。
3. エディタ右上に追加される **「Marpプレビューのトグル（Marpのアイコン）」** ボタンをクリックします。
4. プレビュー画面が起動し、Markdownの変更がリアルタイムに反映されます。

---

## 2. Marp CLI を使ったコマンドラインでの変換

ローカル環境に `node.js` がインストールされている場合、Marp CLI を用いてコマンド一つで様々な形式にエクスポートできます。

### 準備（Marp CLI の実行）
プロジェクトルートで `npx` を使って直接実行できます（事前インストール不要）。

```bash
# HTML形式に変換 (最もレイアウト再現度が高く、アニメーションも動作)
npx @marp-team/marp-cli@latest presentation.md -o presentation.html

# PDF形式に変換 (印刷や配布に最適)
npx @marp-team/marp-cli@latest presentation.md -o presentation.pdf

# PowerPoint (PPTX) 形式に変換 (ローカルプレゼン用)
npx @marp-team/marp-cli@latest presentation.md -o presentation.pptx
```

> [!NOTE]
> 変換時に Chromium（ブラウザ）のダウンロードがバックグラウンドで開始される場合があります。指示に従って進めてください。

---

## 3. 各種フォーマットの特徴と注意点

Marp からエクスポートしたファイルは、フォーマットによって特性が異なります。用途に合わせて選定してください。

| 出力形式 | 編集可能性 | レイアウト再現度 | 特徴と注意点 |
| :--- | :--- | :--- | :--- |
| **HTML** | 不可 (コード修正) | 🔴 **100%再現** | ブラウザで動作。CSSの `grid` レイアウトや文字グラデーションも完全に再現され、フォント崩れもありません。 |
| **PDF** | 不可 | 🔴 **100%再現** | 全てベクター形式（または画像）で出力されるため、どのPCで開いても絶対にレイアウトが崩れません。配布用として最も安全です。 |
| **PPTX** | 部分的に可 | 🟡 **再現度：高** | Marp CLI は各スライドを「高解像度画像」として PowerPoint の各スライドの背景・オブジェクトに貼り付けます。そのため、**PowerPoint側で中のテキストを直接編集することはできません**。レイアウト崩れは起きません。 |

---

## 4. GoogleスライドやPowerPointで「編集可能」なスライドにする方法

「教員からスライド自体のテキストや装飾をPowerPoint / Googleスライド上で微調整するように指示された」など、完全に編集可能なスライドにしたい場合の移行アプローチです。

### アプローチA：Googleスライドの「PDFインポート」を利用する（推奨）
1. Marp CLI で一旦 `presentation.pdf` にエクスポートします。
2. PDFをPowerPoint形式に変換する無料のWebサービス（Adobe Acrobatオンラインツールなど）を利用し、編集可能な `.pptx` に変換します。
3. 変換された `.pptx` を Google ドライブにアップロードし、**「Googleスライドで開く」** を選択します。
   * ※一部フォントやレイアウトの微調整が必要になる場合がありますが、テキストボックスや図形として編集可能になります。

### アプローチB：Gemini やスライド生成AIに Markdown を流し込む
最近のAIスライド生成ツール（Marpに対応したものや、Copilot, Gamma, SlidesGo など）や、Gemini（Google Workspace連携）を利用してスライド化します。

* **手順例 (Gemini Advanced / Google Workspace)**
  1. `presentation.md` のテキスト全体をコピーします。
  2. Gemini に対し、以下のプロンプトを入力してGoogleスライドを作成させます。
     > 「以下のMarkdownテキストはMarp形式のスライド構成案です。この構成とテキストに基づいて、Googleスライドを作成してください。各スライドのタイトルと本文、箇条書き、必要に応じて左右2カラム構成などのレイアウトを反映させてください。[ここにコピーしたMarkdownを貼り付け]」
  3. 出力されたスライドをGoogleスライドにインポートします。

---

## 5. デザインを微調整したい場合 (presentation.md 内の編集)

スライドの文字サイズや余白などを調整したい場合は、`presentation.md` の冒頭にある `style:` ブロックを変更することで全体のスタイルを一括制御できます。

* **スライド幅を狭めたい/広げたい場合**：
  `style` ブロックの `section` にある `padding` を調整します（例: `padding: 60px;`）。
* **フォントサイズを一括で変えたい場合**：
  ```css
  section {
    font-size: 28px; /* デフォルトの文字サイズ */
  }
  ```
