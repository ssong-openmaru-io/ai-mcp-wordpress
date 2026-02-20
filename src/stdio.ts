import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { logger } from "./logger.js";

async function main() {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info(`STDIO 서버 시작 (WordPress: ${config.baseUrl})`);
}

main().catch((err) => {
  logger.error("STDIO 서버 시작 실패:", err);
  process.exit(1);
});
