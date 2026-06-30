# 실시간 회의 번역기 (Web)

차량용 반도체 팹리스 회사 회의 실시간 번역 웹앱.  
마이크 음성 → Whisper STT → GPT-4o 번역 → 실시간 자막.

## 로컬 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
`.env.local` 파일 생성:
```
APP_PASSWORD=원하는비밀번호
SESSION_SECRET=랜덤32자이상문자열
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk_...
DEFAULT_STT_ENGINE=openai
```

### 3. 실행
```bash
npm run dev
```
`http://localhost:3000` 접속

---

## GitHub 업로드

```bash
# GitHub에서 새 레포지토리 생성 후
git remote add origin https://github.com/<유저명>/<레포명>.git
git push -u origin main
```

---

## Vercel 배포

1. [vercel.com](https://vercel.com) 로그인
2. **Add New → Project** 클릭
3. GitHub 레포지토리 연결 (Import)
4. **Environment Variables** 탭에서 아래 값 입력:
   - `APP_PASSWORD`
   - `SESSION_SECRET`
   - `OPENAI_API_KEY`
   - `GROQ_API_KEY`
   - `DEFAULT_STT_ENGINE` = `openai`
5. **Deploy** 클릭 → 완료

이후 main 브랜치에 push할 때마다 자동 배포됩니다.

---

## 주의사항

- 마이크는 HTTPS 환경에서만 동작 (Vercel 기본 제공)
- `.env.local`은 절대 Git에 올리지 마세요
- SESSION_SECRET은 32자 이상 랜덤 문자열 사용 권장
