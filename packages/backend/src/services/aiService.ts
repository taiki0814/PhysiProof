import { Prediction, PredictionRequest } from '@my-app/shared';

/**
 * Gemini API を利用して体重目標の予測とアドバイスを生成するサービス
 */
export class AIService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 現在の活動データと摂取データに基づき、目標達成までの日数を予測する
   */
  async predictWeightGoal(data: PredictionRequest): Promise<Prediction> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;

    const systemPrompt = `
あなたは健康的なダイエットをサポートする専門的なAIアドバイザーです。
ユーザーの運動データ（消費カロリー）と食事データ（摂取カロリー）を分析し、目標体重に達するまでの日数を予測します。

以下の【安全上の制約】を必ず守ってください：
1. 極端な食事制限や過度な運動など、リバウンドや健康被害の恐れがあるアドバイスは絶対に避けてください。
2. 1日のカロリー不足量（Deficit）が大きすぎる場合（例: 1000kcal以上）は、より緩やかなペースを推奨してください。
3. 精神的な健康にも配慮し、ポジティブで継続可能なアドバイスを心がけてください。

【入力データ】
- 1日の平均消費カロリー: ${data.totalCaloriesBurned} kcal
- 1日の平均摂取カロリー: ${data.mealCaloriesConsumed} kcal
- 現在の体重: ${data.currentWeight} kg
- 目標体重: ${data.targetWeight} kg

【出力形式】
JSONオブジェクトのみを返却してください：
{
  "daysToTarget": number (目標達成までの推定日数),
  "advice": "string (健康的で具体的なアドバイス)",
  "dailyCalorieDeficit": number (推奨される1日あたりのカロリー不足量),
  "confidenceScore": number (予測の信頼度 0.0〜1.0)
}
`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: systemPrompt }],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API エラー: ${errorText}`);
    }

    const result = await response.json() as any;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini API から有効なレスポンスが得られませんでした。');
    }

    try {
      const parsed = JSON.parse(text) as Prediction;
      return { ...parsed, debugPrompt: systemPrompt }; // デバッグ用にプロンプトを付加
    } catch (e) {
      throw new Error('AIが生成したデータのパースに失敗しました。');
    }
  }

  /**
   * 食事の写真を解析し、栄養バランスを抽出する (マルチモーダルAI)
   */
  async analyzeMealImage(base64Image: string): Promise<any> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
    
    const prompt = `
あなたはプロの管理栄養士です。提供された食事の画像を分析し、以下のJSON形式で結果を返してください。
{
  "name": "料理名",
  "calories": 数値 (kcal),
  "pfc": {
    "protein": 数値 (g),
    "fat": 数値 (g),
    "carbs": 数値 (g)
  },
  "advice": "健康的で具体的なアドバイス"
}
`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
          ]
        }],
        generationConfig: { response_mime_type: 'application/json' }
      })
    });

    if (!response.ok) throw new Error('Gemini API Meal Analysis Failed');
    const result = await response.json() as any;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  /**
   * 運動種目と回数のリストから、それぞれの目安消費カロリーを算出する
   */
  async calculateExerciseCalories(stats: { exercise_type: string, total_count: number }[]): Promise<{ exercise_type: string, unit_calories: number }[]> {
    if (stats.length === 0) return [];
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.apiKey}`;
    
    const prompt = `
あなたはプロのスポーツトレーナーです。以下の運動種目について、一般的な成人（65kg）が「1回」行った際の目安となる消費カロリー(kcal)を算出してください。
非常に小さい値（例: 0.1〜0.5kcal）になることが予想されますが、正確な推定値を出してください。

【対象種目】
${stats.map(s => s.exercise_type).join(', ')}

【出力形式】
JSON形式の配列のみを返してください。
[
  {
    "exercise_type": "種目名",
    "unit_calories": 数値 (1回あたりのkcal)
  }
]
`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: 'application/json' }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini API Error:', response.status, errText);
        return stats.map(s => ({ exercise_type: s.exercise_type, unit_calories: 0 }));
      }
      
      const result = await response.json() as any;
      let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        console.error('No text returned from Gemini API');
        return stats.map(s => ({ exercise_type: s.exercise_type, unit_calories: 0 }));
      }

      // マークダウンのコードブロック (```json ... ```) を除去
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();

      return JSON.parse(text);
    } catch (err) {
      console.error('Failed to calculate unit calories via AI', err);
      return stats.map(s => ({ exercise_type: s.exercise_type, unit_calories: 0 }));
    }
  }
}
