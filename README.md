# WordPress MCP Server

WordPress REST API를 MCP(Model Context Protocol)로 래핑한 Node.js 서버.
AI 에이전트에서 WordPress 게시글을 조회, 생성, 수정, 삭제할 수 있다.

## 프로젝트 구조

```
├── src/
│   ├── config.ts             # 환경 변수 로드 및 설정 타입 정의
│   ├── logger.ts             # stderr 기반 로거 (STDIO 모드 안전)
│   ├── wordpress-client.ts   # WordPress REST API 클라이언트
│   ├── server.ts             # MCP 서버 생성 + Tool 등록 (공통 로직)
│   ├── stdio.ts              # STDIO 전송 방식 진입점
│   └── sse.ts                # Streamable HTTP + 레거시 SSE 전송 방식 진입점
├── dist/                     # TypeScript 빌드 출력
├── .env.example              # 환경 변수 예시
├── package.json
└── tsconfig.json
```

## 아키텍처

```
┌─────────────┐     ┌──────────────────────────┐
│  stdio.ts   │     │         sse.ts           │
│ (StdioTx)   │     │ (Express)                │
│             │     │  ┌─────────────────────┐ │
│             │     │  │ Streamable HTTP      │ │
│             │     │  │ POST|GET|DELETE /mcp │ │
│             │     │  ├─────────────────────┤ │
│             │     │  │ Legacy SSE          │ │
│             │     │  │ GET /sse            │ │
│             │     │  │ POST /messages      │ │
│             │     │  └─────────────────────┘ │
└──────┬──────┘     └────────────┬─────────────┘
       │                         │
       └───────────┬─────────────┘
                   │
           ┌───────▼───────┐
           │   server.ts   │
           │ (McpServer +  │
           │  Tool 정의)   │
           └───────┬───────┘
                   │
         ┌─────────▼─────────┐
         │ wordpress-client  │
         │ (REST API 호출)   │
         └─────────┬─────────┘
                   │
           ┌───────▼───────┐
           │   WordPress   │
           │  /wp-json/v2  │
           └───────────────┘
```

`server.ts`의 `createServer()`가 공통 로직 레이어이며, STDIO와 SSE 양쪽에서 동일하게 사용된다.

## 사전 요구사항

- Node.js 18+
- WordPress 사이트 (REST API 활성화 상태)
- WordPress Application Password 또는 Bearer Token

### WordPress Application Password 발급

1. WordPress 관리자 > 사용자 > 프로필
2. "애플리케이션 비밀번호" 섹션에서 이름을 입력하고 생성
3. 표시되는 비밀번호를 복사 (공백 포함 그대로 사용)

## 설치

```bash
npm install
npm run build
```

## 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 편집한다:

```env
# WordPress 사이트 URL (trailing slash 없이)
WORDPRESS_BASE_URL=https://your-wordpress-site.com

# 인증 방식 1: Application Password (권장)
WORDPRESS_USERNAME=admin
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# 인증 방식 2: Bearer Token (Application Password 대신 사용)
# WORDPRESS_TOKEN=your-bearer-token

# SSE 서버 포트 (기본값: 3000)
SSE_PORT=3000

# 자체 서명 인증서 허용 (로컬 HTTPS 개발 환경에서 사용)
# WORDPRESS_TLS_REJECT_UNAUTHORIZED=false
```

| 변수 | 필수 | 설명 |
|------|------|------|
| `WORDPRESS_BASE_URL` | O | WordPress 사이트 URL |
| `WORDPRESS_USERNAME` | △ | Application Password 사용 시 |
| `WORDPRESS_APP_PASSWORD` | △ | Application Password 사용 시 |
| `WORDPRESS_TOKEN` | △ | Bearer Token 사용 시 |
| `SSE_PORT` | X | SSE 서버 포트 (기본값: 3000) |
| `WORDPRESS_TLS_REJECT_UNAUTHORIZED` | X | `false` 설정 시 자체 서명 인증서 허용 |

`WORDPRESS_TOKEN`이 설정되면 Bearer 인증을 사용하고, 없으면 `WORDPRESS_USERNAME` + `WORDPRESS_APP_PASSWORD`로 Basic 인증을 사용한다.

## 실행

### STDIO 모드

로컬 MCP 클라이언트(Claude Desktop, Claude Code 등)에서 사용하는 방식.

```bash
# 빌드 후 실행
npm run start:stdio

# 개발 모드 (tsx 직접 실행)
npm run dev:stdio
```

### SSE(HTTP) 모드

원격 MCP 클라이언트에서 HTTP로 접속하는 방식. **Streamable HTTP**(최신)와 **레거시 SSE**(구버전 클라이언트 호환) 두 가지 프로토콜을 동시에 지원한다.

```bash
# 빌드 후 실행
npm run start:sse

# 개발 모드
npm run dev:sse
```

서버 시작 후 사용 가능한 엔드포인트:

**Streamable HTTP (최신 프로토콜)**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/mcp` | JSON-RPC 요청 처리 (초기화 + 도구 호출) |
| `GET` | `/mcp` | SSE 스트림 (서버→클라이언트 알림) |
| `DELETE` | `/mcp` | 세션 종료 |

**Legacy SSE (구버전 클라이언트 호환)**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/sse` | SSE 스트림 연결 (세션 생성) |
| `POST` | `/messages?sessionId=...` | JSON-RPC 메시지 전송 |

**공통**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 상태 확인 |

## 클라이언트 설정

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "node",
      "args": ["/절대경로/wordpress-mcp-server/dist/stdio.js"],
      "env": {
        "WORDPRESS_BASE_URL": "https://your-site.com",
        "WORDPRESS_USERNAME": "admin",
        "WORDPRESS_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add wordpress -- node /절대경로/wordpress-mcp-server/dist/stdio.js
```

또는 `.mcp.json`:

```json
{
  "mcpServers": {
    "wordpress": {
      "command": "node",
      "args": ["/절대경로/wordpress-mcp-server/dist/stdio.js"],
      "env": {
        "WORDPRESS_BASE_URL": "https://your-site.com",
        "WORDPRESS_USERNAME": "admin",
        "WORDPRESS_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx",
        "WORDPRESS_TLS_REJECT_UNAUTHORIZED": "false"
      }
    }
  }
}
```

### SSE 모드 클라이언트 연결

SSE 서버를 실행한 후, MCP 클라이언트에서 접속:

```
# Streamable HTTP 지원 클라이언트 (최신)
http://localhost:3000/mcp

# Legacy SSE 지원 클라이언트 (구버전)
http://localhost:3000/sse
```

## MCP Tools

### listPosts

게시글 목록을 조회한다. 페이지네이션, 검색, 상태 필터를 지원한다.

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `page` | number | X | 페이지 번호 (기본값: 1) |
| `per_page` | number | X | 페이지당 게시글 수 (기본값: 10, 최대: 100) |
| `search` | string | X | 검색어 |
| `status` | enum | X | `publish`, `draft`, `pending`, `private`, `trash` |
| `orderby` | enum | X | `date`, `id`, `title`, `slug`, `modified` |
| `order` | enum | X | `asc`, `desc` |

### getPost

게시글 하나를 ID로 조회한다.

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | number | O | 게시글 ID |

### createPost

새 게시글을 생성한다.

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `title` | string | O | 게시글 제목 |
| `content` | string | O | 게시글 내용 (HTML 가능) |
| `status` | enum | X | `publish`, `draft`, `pending`, `private` (기본값: `draft`) |
| `excerpt` | string | X | 게시글 요약 |
| `categories` | number[] | X | 카테고리 ID 배열 |
| `tags` | number[] | X | 태그 ID 배열 |

### updatePost

기존 게시글을 수정한다. 전달된 필드만 변경된다.

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | number | O | 수정할 게시글 ID |
| `title` | string | X | 변경할 제목 |
| `content` | string | X | 변경할 내용 (HTML 가능) |
| `status` | enum | X | `publish`, `draft`, `pending`, `private` |
| `excerpt` | string | X | 변경할 요약 |
| `categories` | number[] | X | 변경할 카테고리 ID 배열 |
| `tags` | number[] | X | 변경할 태그 ID 배열 |

### deletePost

게시글을 삭제한다.

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `id` | number | O | 삭제할 게시글 ID |
| `force` | boolean | X | `true`이면 영구 삭제, `false`이면 휴지통 이동 (기본값: `false`) |

## 기술 스택

| 항목 | 사용 기술 |
|------|-----------|
| 런타임 | Node.js 18+ |
| 언어 | TypeScript (ESM) |
| MCP SDK | `@modelcontextprotocol/sdk` ^1.26.0 |
| HTTP 클라이언트 | Node.js 내장 `fetch` |
| 스키마 검증 | `zod` |
| SSE 서버 | Express + `StreamableHTTPServerTransport` + `SSEServerTransport` |
| WordPress API | `/wp-json/wp/v2` (REST API v2) |

## 주요 설계 결정

- **공통 로직 분리**: `server.ts`의 `createServer(config)` 함수가 McpServer 인스턴스와 모든 Tool을 생성한다. STDIO와 SSE 진입점은 전송 방식만 다르다.
- **stderr 로깅**: STDIO 모드에서 stdout은 JSON-RPC 프로토콜 메시지 전용이므로, 모든 로그는 `console.error`(stderr)로 출력한다.
- **듀얼 전송 프로토콜**: SSE 서버가 Streamable HTTP(`/mcp`)와 레거시 SSE(`/sse` + `/messages`)를 동시에 제공한다. 최신 클라이언트와 구버전 클라이언트 모두 호환된다.
- **세션 관리**: 두 전송 방식 모두 클라이언트별 독립 세션을 생성한다. Streamable HTTP는 `mcp-session-id` 헤더, 레거시 SSE는 `sessionId` 쿼리 파라미터로 세션을 식별한다.
- **오류 처리**: WordPress API 오류 응답(4xx, 5xx)을 파싱하여 MCP `isError: true` 결과로 반환한다. 에이전트가 오류 내용을 이해하고 대응할 수 있다.
