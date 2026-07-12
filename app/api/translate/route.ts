import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { text, language, context } = await req.json();

    if (!text) return NextResponse.json({ translation: "" });
    if (language === "korean" || language === "ko") {
      return NextResponse.json({ translation: text });
    }

    let systemPrompt =
      "당신은 전문 번역가입니다. 화자는 차량용 반도체 팹리스 회사에 근무하며, 반도체 관련 회의뿐만 아니라 다양한 주제의 회의를 진행합니다. 전문 용어와 문맥을 고려하여 자연스러운 한국어로 번역하세요. 번역문만 출력하세요.";
    if (context && typeof context === "string" && context.trim()) {
      systemPrompt += `\n\n[이번 회의 맥락 및 용어 힌트]\n${context.trim().slice(0, 800)}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      max_tokens: 500,
    });

    return NextResponse.json({
      translation: response.choices[0].message.content?.trim() ?? "",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Translate error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
