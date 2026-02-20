import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { logger } from "./logger.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// --- Streamable HTTP 세션 관리 ---
interface StreamableSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

const streamableSessions = new Map<string, StreamableSession>();

// --- 레거시 SSE 세션 관리 ---
const legacySessions = new Map<string, SSEServerTransport>();

async function main() {
  const config = loadConfig();
  const app = express();
  app.use(express.json());

  // ============================================================
  // Health check
  // ============================================================
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      streamableSessions: streamableSessions.size,
      legacySessions: legacySessions.size,
      wordpress: config.baseUrl,
    });
  });

  // ============================================================
  // Streamable HTTP 전송 (최신 프로토콜) — /mcp
  // ============================================================
  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && streamableSessions.has(sessionId)) {
      const session = streamableSessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // 새 세션 생성
    logger.info("[streamable] 새 MCP 세션 생성");
    const server = createServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        logger.info(`[streamable] 세션 종료: ${id}`);
        streamableSessions.delete(id);
      }
    };

    await server.connect(transport);

    if (transport.sessionId) {
      streamableSessions.set(transport.sessionId, { server, transport });
      logger.info(`[streamable] 세션 생성됨: ${transport.sessionId}`);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      res.status(400).json({ error: "유효하지 않은 세션입니다." });
      return;
    }
    const session = streamableSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      res.status(400).json({ error: "유효하지 않은 세션입니다." });
      return;
    }
    const session = streamableSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    streamableSessions.delete(sessionId);
    logger.info(`[streamable] 세션 삭제됨: ${sessionId}`);
  });

  // ============================================================
  // 레거시 SSE 전송 (2024-11-05 프로토콜) — /sse + /messages
  // ============================================================

  // GET /sse — 클라이언트가 SSE 스트림을 열고 sessionId를 받는다
  app.get("/sse", async (req, res) => {
    logger.info("[legacy-sse] 새 SSE 연결 요청");

    const transport = new SSEServerTransport("/messages", res);
    const server = createServer(config);

    legacySessions.set(transport.sessionId, transport);
    logger.info(`[legacy-sse] 세션 생성됨: ${transport.sessionId}`);

    res.on("close", () => {
      logger.info(`[legacy-sse] 세션 종료: ${transport.sessionId}`);
      legacySessions.delete(transport.sessionId);
    });

    await server.connect(transport);
  });

  // POST /messages — 클라이언트가 JSON-RPC 메시지를 보낸다
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId || !legacySessions.has(sessionId)) {
      logger.warn(`[legacy-sse] 유효하지 않은 세션: ${sessionId}`);
      res.status(400).json({ error: "유효하지 않은 세션입니다." });
      return;
    }

    const transport = legacySessions.get(sessionId)!;
    await transport.handlePostMessage(req, res, req.body);
  });

  // ============================================================
  // 서버 시작
  // ============================================================
  app.listen(config.ssePort, () => {
    logger.info(`MCP 서버 시작: http://localhost:${config.ssePort}`);
    logger.info(`  Streamable HTTP : POST|GET|DELETE /mcp`);
    logger.info(`  Legacy SSE      : GET /sse + POST /messages`);
    logger.info(`  Health check    : GET /health`);
    logger.info(`  WordPress       : ${config.baseUrl}`);
  });
}

main().catch((err) => {
  logger.error("SSE 서버 시작 실패:", err);
  process.exit(1);
});
