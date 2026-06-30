import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Record {
  timestamp: string;
  language: string;
  original: string;
  translation: string;
}

export async function POST(req: NextRequest) {
  const { records }: { records: Record[] } = await req.json();

  if (!records || records.length === 0) {
    return NextResponse.json({ records: [] });
  }

  const lines = records
    .map((r) => `[${r.timestamp}] ${r.original}`)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "다음은 음성인식으로 추출된 회의 텍스트입니다. 오탈자와 문맥상 어색한 부분을 보정하세요. 각 줄의 [HH:MM:SS] 타임스탬프는 그대로 유지하고, 내용만 수정하여 동일한 형식으로 출력하세요.",
      },
      { role: "user", content: lines },
    ],
  });

  const refined = response.choices[0].message.content?.trim() ?? "";
  const refinedRecords: Record[] = [];

  for (const line of refined.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ts = trimmed.startsWith("[") ? trimmed.slice(1, 9) : "";
    const content = trimmed.startsWith("[") ? trimmed.slice(11).trim() : trimmed;
    refinedRecords.push({ timestamp: ts, language: "refined", original: content, translation: "" });
  }

  return NextResponse.json({ records: refinedRecords });
}
