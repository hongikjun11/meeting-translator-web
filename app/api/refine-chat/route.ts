import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Record } from "@/app/api/refine/route";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          timestamp: { type: "string" },
          original: { type: "string" },
          translation: { type: "string" },
        },
        required: ["i", "timestamp", "original", "translation"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["records", "reply"],
  additionalProperties: false,
} as const;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface Body {
  records: Record[];
  instruction: string;
  history?: ChatTurn[];
}

export async function POST(req: NextRequest) {
  try {
    const { records, instruction, history }: Body = await req.json();

    if (!instruction || !instruction.trim()) {
      return NextResponse.json({ records: records ?? [], reply: "내용을 입력해주세요." });
    }

    const hasRecords = Array.isArray(records) && records.length > 0;

    const indexed = hasRecords
      ? records.map((r, i) => ({ i, timestamp: r.timestamp, original: r.original, translation: r.translation }))
      : [];

    const systemPrompt =
      "당신은 실시간 회의록 편집 도우미입니다. 사용자와 대화하며 회의 기록을 다듬습니다.\n" +
      "세 가지 상황이 있습니다:\n" +
      "1) 사용자가 회의 배경·주제·참석자·전문용어를 설명하는 경우: 그 내용을 이해했다고 한두 문장으로 짧게 답하고(reply), records는 빈 배열([])로 반환하세요. 이 배경은 이후 기록 수정에 참고합니다.\n" +
      "2) 사용자가 질문하거나 대화를 거는 경우(예: '지금 무슨 내용이야?', '참석자 누구였지?'): 지금까지의 회의 배경과 대화 기록을 바탕으로 reply에 간단하고 친절하게 답하고, records는 빈 배열([])로 반환하세요.\n" +
      "3) 사용자가 기록 수정을 지시하는 경우: 지시와 지금까지 파악한 회의 배경을 함께 참고해 기록을 수정하세요.\n" +
      "매우 중요한 원칙:\n" +
      "- 답변·요약·설명은 반드시 reply 필드에만 쓰세요. records에는 절대 답변이나 요약을 넣지 마세요.\n" +
      "- 상황 1, 2에서는 records를 반드시 빈 배열([])로 두세요.\n" +
      "- 여러 항목을 하나로 합치거나, 한 항목에 다른 항목 내용을 몰아넣지 마세요. 항목은 1:1로 유지합니다.\n" +
      "- 각 항목의 분량을 원문보다 크게 늘리지 마세요. 요약하거나 새로 쓰지 말고, 오인식된 단어만 고칩니다.\n" +
      "수정 규칙(상황 3):\n" +
      "- **실제로 수정한 항목만** records 배열에 담아 반환하세요. 바뀌지 않은 항목은 절대 포함하지 마세요.\n" +
      "- 각 수정 항목에는 원래 i(인덱스)와 timestamp를 그대로 유지합니다.\n" +
      "- original(원문)을 고치면 translation(번역문)도 일관되게 함께 수정합니다.\n" +
      "- 같은 단어가 다르게 오인식된 경우, 회의 배경과 문맥을 근거로 올바른 하나의 표기로 통일합니다.\n" +
      "- 회의가 한국어·중국어 등 여러 언어로 진행될 수 있습니다.";

    const priorTurns: { role: "user" | "assistant"; content: string }[] = (history ?? [])
      .slice(-10)
      .map((h) => ({ role: h.role, content: h.content }));

    const userContent = hasRecords
      ? `[지시]\n${instruction.trim()}\n\n[대화 기록 JSON]\n${JSON.stringify(indexed)}`
      : `[회의 배경 설명]\n${instruction.trim()}\n\n(아직 회의 기록이 없습니다. 배경을 기억하고 짧게 답하세요.)`;

    const message = await anthropic.messages.create({
      // 전체 정제는 대화 전체를 처리해 느림 → 빠른 Haiku로 60초 타임아웃 방지
      model: "claude-haiku-4-5",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [...priorTurns, { role: "user", content: userContent }],
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);

    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || "{}";
    const parsed = JSON.parse(raw) as {
      records?: { i: number; timestamp?: string; original?: string; translation?: string }[];
      reply?: string;
    };

    if (!hasRecords) {
      return NextResponse.json({ records: [], reply: parsed.reply ?? "알겠습니다. 배경을 기억해두겠습니다." });
    }

    const updated: Record[] = records.map((r, i) => {
      const found = parsed.records?.find((x) => x.i === i);
      if (!found) return r;
      const newOriginal = found.original ?? r.original;
      const ballooned = newOriginal.length > r.original.length * 3 + 50;
      if (ballooned) return r;
      return {
        timestamp: found.timestamp ?? r.timestamp,
        language: r.language,
        original: newOriginal,
        translation: found.translation ?? r.translation,
      };
    });

    return NextResponse.json({ records: updated, reply: parsed.reply ?? "수정을 완료했습니다." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Refine-chat error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
