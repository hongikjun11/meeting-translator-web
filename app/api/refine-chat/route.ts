import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Record } from "@/app/api/refine/route";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Body {
  records: Record[];
  instruction: string;
  context?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { records, instruction, context }: Body = await req.json();

    if (!records || records.length === 0) {
      return NextResponse.json({ records: [], reply: "수정할 대화 기록이 없습니다." });
    }
    if (!instruction || !instruction.trim()) {
      return NextResponse.json({ records, reply: "지시 내용을 입력해주세요." });
    }

    // 인덱스를 붙여 LLM이 순서를 유지하도록 함
    const indexed = records.map((r, i) => ({
      i,
      timestamp: r.timestamp,
      original: r.original,
      translation: r.translation,
    }));

    let systemPrompt =
      "당신은 회의록 편집 도우미입니다. 아래 JSON 대화 기록을 사용자의 지시에 따라 수정하세요.\n" +
      "규칙:\n" +
      "- **실제로 수정한 항목만** records 배열에 담아 반환하세요. 바뀌지 않은 항목은 절대 포함하지 마세요 (응답을 짧게 유지).\n" +
      "- 각 수정 항목에는 원래 i(인덱스)를 그대로 유지합니다. timestamp도 유지합니다.\n" +
      "- 지시와 관련된 부분만 고칩니다.\n" +
      "- original(원문)을 고치면 translation(번역문)도 일관되게 함께 수정합니다.\n" +
      '- 반드시 다음 JSON 형식으로만 응답: {"records":[{"i":번호,"timestamp":"HH:MM:SS","original":"...","translation":"..."}],"reply":"수정 내용을 한국어로 한두 문장 요약"}\n' +
      '- 수정할 것이 없으면 {"records":[],"reply":"수정할 부분이 없습니다."}';
    if (context && context.trim()) {
      systemPrompt += `\n\n[회의 맥락/용어 힌트]\n${context.trim().slice(0, 800)}`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `[지시]\n${instruction.trim()}\n\n[대화 기록 JSON]\n` +
            JSON.stringify(indexed),
        },
      ],
    });

    const raw = response.choices[0].message.content?.trim() ?? "{}";
    const parsed = JSON.parse(raw) as {
      records?: { i: number; timestamp?: string; original?: string; translation?: string }[];
      reply?: string;
    };

    // 원본 순서/언어를 보존하며 인덱스로 병합
    const updated: Record[] = records.map((r, i) => {
      const found = parsed.records?.find((x) => x.i === i);
      if (!found) return r;
      return {
        timestamp: found.timestamp ?? r.timestamp,
        language: r.language,
        original: found.original ?? r.original,
        translation: found.translation ?? r.translation,
      };
    });

    return NextResponse.json({
      records: updated,
      reply: parsed.reply ?? "수정을 완료했습니다.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Refine-chat error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
