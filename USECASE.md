# WordPress 블로그 자동 게시 파이프라인

---

## 📋 플로우 개요: WordPress 블로그 자동 게시 파이프라인

사용자가 **Markdown 파일을 업로드**하면, 파일 검증 → HTML 변환 → WordPress 게시까지 자동으로 처리하는 3단계 에이전트 플로우입니다.

---

## 🔄 전체 흐름

```
Start → FileValidator → MD2HTML → BlogWriter
(입력)    (파일 검증)    (변환)     (게시)
```

---

## 각 노드 상세

### 1. Start (시작)
- **입력 방식:** Chat Input (채팅으로 파일 업로드)
- **Flow State 초기화:** `documentTitle`, `documentContent`, `documentContext` 세 가지 상태 변수를 빈 값으로 초기화

### 2. FileValidator (파일 검증기)
- **모델:** Azure OpenAI GPT-4o
- **역할:** 업로드된 파일(`{{ file_attachment }}`)의 내용이 유효한지 검증
- **핵심 규칙:**
  - 파일 내용을 **한 글자도 변경하지 않고** 그대로 출력
  - 요약/수정/새로운 내용 생성 금지
  - 파일이 비어있거나 메타데이터만 있으면 에러 메시지 반환
- **상태 업데이트:** 출력 결과를 `documentContext`에 저장

### 3. MD2HTML (Markdown → HTML 변환기)
- **모델:** Azure OpenAI GPT-4o
- **역할:** FileValidator의 출력(Markdown)을 HTML로 변환
- **변환 규칙:**
  - 문서 구조를 유지한 채 HTML로 변환
  - **볼드체**(`**텍스트**`) → `<font color="red">텍스트</font>` (빨간색으로 강조). 단, 목차/목록의 볼드체는 제외
  - 코드 블록 → `<pre>` 태그로 변환
- **상태 업데이트:** 변환된 HTML을 `documentContext`에 저장

### 4. BlogWriter (블로그 작성 에이전트)
- **모델:** Azure OpenAI GPT-4o
- **역할:** 변환된 HTML 콘텐츠를 WordPress에 게시
- **도구:** Custom MCP 서버 (`http://10.20.1.10:3100/sse`)의 `createPost` 액션 사용
- **동작:** MD2HTML의 출력에서 제목과 본문을 추출 → WordPress MCP를 호출하여 게시물 생성

---

## 요약

한마디로, **"Markdown 파일 → 검증 → HTML 변환 → WordPress 자동 게시"** 파이프라인입니다. 내부 MCP 서버(`10.20.1.10:3100`)를 통해 WordPress API와 연동되어 있고, 모든 단계에서 Azure OpenAI의 GPT-4o 모델을 사용합니다. 특이한 점으로는 볼드체를 빨간색 폰트로 변환하는 커스텀 스타일링 규칙이 적용되어 있습니다.