import "dotenv/config";

export interface Config {
  baseUrl: string;
  auth:
    | { type: "basic"; username: string; password: string }
    | { type: "bearer"; token: string };
  ssePort: number;
  /** true이면 자체 서명 인증서 등 TLS 검증 실패를 무시한다 */
  tlsRejectUnauthorized: boolean;
}

export function loadConfig(): Config {
  const baseUrl = process.env.WORDPRESS_BASE_URL;
  if (!baseUrl) {
    throw new Error("WORDPRESS_BASE_URL 환경 변수가 설정되지 않았습니다.");
  }

  const token = process.env.WORDPRESS_TOKEN;
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;

  let auth: Config["auth"];

  if (token) {
    auth = { type: "bearer", token };
  } else if (username && appPassword) {
    auth = { type: "basic", username, password: appPassword };
  } else {
    throw new Error(
      "인증 정보가 설정되지 않았습니다. WORDPRESS_TOKEN 또는 WORDPRESS_USERNAME + WORDPRESS_APP_PASSWORD를 설정하세요."
    );
  }

  const ssePort = parseInt(process.env.SSE_PORT || "3000", 10);

  // NODE_TLS_REJECT_UNAUTHORIZED=0 또는 WORDPRESS_TLS_REJECT_UNAUTHORIZED=false 일 때 TLS 검증 비활성화
  const tlsRejectUnauthorized =
    process.env.WORDPRESS_TLS_REJECT_UNAUTHORIZED !== "false" &&
    process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0";

  return { baseUrl: baseUrl.replace(/\/+$/, ""), auth, ssePort, tlsRejectUnauthorized };
}
