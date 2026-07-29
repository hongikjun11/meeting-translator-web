import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

// 한글이 전체 글자의 절반 이상이면 한국어로 간주 (gpt-4o-transcribe는 언어를 반환하지 않음)
function detectKorean(text: string): boolean {
  const hangul = (text.match(/[가-힣]/g) || []).length;
  const letters = (text.match(/[\p{L}]/gu) || []).length;
  return letters > 0 && hangul / letters >= 0.5;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File;
    const engine = (formData.get("engine") as string) ?? "openai";
    const koreanOnly = formData.get("koreanOnly") === "true";
    // 회의 주제/전문용어 힌트 — Whisper가 도메인 단어를 더 정확히 인식 (최대 ~224토큰)
    const prompt = ((formData.get("prompt") as string) ?? "").slice(0, 800);

    if (!file || file.size === 0) {
      return NextResponse.json({ text: "", language: "" });
    }

    const arrayBuffer = await file.arrayBuffer();

    // 파일 크기가 너무 작으면 스킵 (1KB 미만)
    if (arrayBuffer.byteLength < 1024) {
      return NextResponse.json({ text: "", language: "" });
    }

    const audioFile = new File([arrayBuffer], "audio.webm", { type: "audio/webm" });

    if (engine === "groq") {
      const { Groq } = await import("groq-sdk");
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const kwargs: Parameters<typeof groq.audio.transcriptions.create>[0] = {
        model: "whisper-large-v3",
        file: audioFile,
        response_format: "verbose_json",
      };
      if (koreanOnly) kwargs.language = "ko";
      if (prompt) kwargs.prompt = prompt;
      const transcript = await groq.audio.transcriptions.create(kwargs);
      return NextResponse.json({
        text: transcript.text.trim(),
        language: (transcript as { language?: string }).language ?? "",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // gpt-4o-transcribe: whisper-1보다 정확 (특히 웅얼거림·전문용어).
    // 단 verbose_json(언어 감지) 미지원 → response_format은 json, 언어는 아래 휴리스틱으로 판별.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kwargs: any = {
      model: "gpt-4o-transcribe",
      file: audioFile,
      response_format: "json",
    };
    if (koreanOnly) kwargs.language = "ko";
    if (prompt) kwargs.prompt = prompt;
    const transcript = await openai.audio.transcriptions.create(kwargs);
    const text = transcript.text.trim();
    return NextResponse.json({
      text,
      language: koreanOnly || detectKorean(text) ? "korean" : "",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Transcribe error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
