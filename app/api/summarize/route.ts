import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { Record } from "@/app/api/refine/route";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { records, history }: { records: Record[]; history?: ChatTurn[] } = await req.json();

    if (!records || records.length === 0) {
      return NextResponse.json({ summary: "" });
    }

    const transcript = records
      .map((r) => {
        const line = `[${r.timestamp}] ${r.original}`;
        return r.translation && r.translation !== r.original ? `${line} → ${r.translation}` : line;
      })
      .join("\n");

    // 브리핑(회의 배경) 있으면 참석자·안건 정확도에 활용
    const briefing = (history ?? [])
      .filter((h) => h.role === "user")
      .map((h) => h.content)
      .join("\n")
      .slice(0, 1500);

    const systemPrompt =
      "당신은 전문 회의록 작성자입니다. 음성인식으로 기록된 회의 대화와 (있다면) 회의 배경 메모를 바탕으로 정식 회의록을 한국어 마크다운으로 작성하세요.\n\n" +
      "다음 구조를 따르세요:\n" +
      "# (회의 주제를 담은 제목)\n" +
      "- **일시 / 장소 / 참석자**: 배경 메모나 대화에서 파악. 불명확하면 '미상'.\n\n" +
      "## 1. 안건 개요\n" +
      "배경 메모에 원안(요청사항) 목록이 있으면 번호와 함께 정리. 없으면 대화에서 도출한 안건 목록을 정리.\n\n" +
      "## 2. 안건별 논의 내용\n" +
      "안건마다 소제목(###)을 달고, 현황/문제점, 논의된 해결방식, 담당팀 판단, 우려사항을 업무 문서체 서술로 정리. 단순 나열이 아니라 맥락이 드러나게.\n\n" +
      "## 3. 결정 사항 및 범위 조정\n" +
      "합의된 결론, 그리고 제외·보류된 안건이 있으면 그 사유를 명시(배경 메모 우선 반영).\n\n" +
      "## 4. 최종 확정 리스트\n" +
      "실제 진행할 항목을 '- [번호/항목] — 담당(있으면)' 형식 불릿으로. 담당자 정보는 배경 메모에서 가져오고 없으면 생략.\n\n" +
      "## 5. 핵심 요약\n" +
      "가장 중요한 결론을 5개 내외 불릿으로.\n\n" +
      "## 6. 액션 아이템\n" +
      "'- [항목] 할 일 — 담당 / 비고' 형식 불릿으로. 후속 확인 필요사항도 포함.\n\n" +
      "작성 규칙:\n" +
      "- 대화는 구어체이고 음성인식 오류가 섞여 있습니다. 문맥으로 의미를 추론해 정리하되, 없는 사실을 지어내지 마세요.\n" +
      "- 참석자·담당자·안건 삭제/보류 결정 등 대화만으로 불분명한 정보는 반드시 [회의 배경/참고 메모]를 우선 근거로 삼으세요.\n" +
      "- '구독', '좋아요', '시청해 주셔서 감사합니다', '자막은 설정에서', 광고성 문구 등 회의와 무관한 음성인식 환각은 완전히 무시하세요.\n" +
      "- 전문용어(Wafer, Lot, Good die, Map, WIP, FCST, MES 등)는 원문 표기를 살리세요.\n" +
      "- 업무 문서답게 간결하고 정확하게 작성하세요.";

    const userContent =
      (briefing ? `[회의 배경/참고 메모]\n${briefing}\n\n` : "") +
      `[회의 대화 기록]\n${transcript}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    return NextResponse.json({
      summary: response.choices[0].message.content?.trim() ?? "",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Minutes error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
