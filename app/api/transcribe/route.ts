import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("audio") as File;
    const engine = (formData.get("engine") as string) ?? "openai";
    const koreanOnly = formData.get("koreanOnly") === "true";

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
      const transcript = await groq.audio.transcriptions.create(kwargs);
      return NextResponse.json({
        text: transcript.text.trim(),
        language: (transcript as { language?: string }).language ?? "",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kwargs: any = {
      model: "whisper-1",
      file: audioFile,
      response_format: "verbose_json",
    };
    if (koreanOnly) kwargs.language = "ko";
    const transcript = await openai.audio.transcriptions.create(kwargs);
    return NextResponse.json({
      text: transcript.text.trim(),
      language: (transcript as { language?: string }).language ?? "",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Transcribe error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
