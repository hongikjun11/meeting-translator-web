import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Record } from "@/app/api/refine/route";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { records }: { records: Record[] } = await req.json();

  if (!records || records.length === 0) {
    return NextResponse.json({ summary: "" });
  }

  const transcript = records
    .map((r) => {
      const line = `[${r.timestamp}] ${r.original}`;
      return r.translation ? `${line} → ${r.translation}` : line;
    })
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "당신은 회의 내용을 요약하는 전문가입니다. 주요 논의 사항, 결정된 사항, 액션 아이템을 한국어로 간결하게 요약하세요.",
      },
      { role: "user", content: `다음 회의 내용을 요약해주세요:\n\n${transcript}` },
    ],
  });

  return NextResponse.json({
    summary: response.choices[0].message.content?.trim() ?? "",
  });
}
