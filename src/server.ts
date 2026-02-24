import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WordPressClient } from "./wordpress-client.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";

/** WordPress API 응답에서 HTML 태그를 제거한 클린 객체를 반환한다 */
function cleanPost(post: {
  id: number;
  date: string;
  slug: string;
  status: string;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  author: number;
  featured_media: number;
  categories: number[];
  tags: number[];
  link: string;
}) {
  return {
    id: post.id,
    date: post.date,
    slug: post.slug,
    status: post.status,
    title: stripHtml(post.title.rendered),
    content: stripHtml(post.content.rendered),
    excerpt: stripHtml(post.excerpt.rendered),
    author: post.author,
    featured_media: post.featured_media,
    categories: post.categories,
    tags: post.tags,
    link: post.link,
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: "wordpress-mcp-server",
    version: "1.0.0",
  });

  const wp = new WordPressClient(config);

  // --- listPosts ---
  server.tool(
    "listPosts",
    "WordPress 게시글 목록을 조회합니다. 페이지네이션, 검색, 상태 필터를 지원합니다.",
    {
      page: z.number().int().min(1).optional().describe("페이지 번호 (기본값: 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("페이지당 게시글 수 (기본값: 10, 최대: 100)"),
      search: z.string().optional().describe("검색어"),
      status: z
        .enum(["publish", "draft", "pending", "private", "trash"])
        .optional()
        .describe("게시글 상태 필터"),
      orderby: z
        .enum(["date", "id", "title", "slug", "modified"])
        .optional()
        .describe("정렬 기준 (기본값: date)"),
      order: z.enum(["asc", "desc"]).optional().describe("정렬 방향 (기본값: desc)"),
    },
    async (params) => {
      logger.info("listPosts 호출", params);
      try {
        const posts = await wp.listPosts(params);
        return {
          content: [{ type: "text", text: jsonText(posts.map(cleanPost)) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- getPost ---
  server.tool(
    "getPost",
    "WordPress 게시글 하나를 ID로 조회합니다.",
    {
      id: z.number().int().min(1).describe("게시글 ID"),
    },
    async ({ id }) => {
      logger.info(`getPost 호출: id=${id}`);
      try {
        const post = await wp.getPost(id);
        return {
          content: [{ type: "text", text: jsonText(cleanPost(post)) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- createPost ---
  server.tool(
    "createPost",
    "WordPress에 새 게시글을 생성합니다.",
    {
      title: z.string().describe("게시글 제목"),
      content: z.string().describe("게시글 내용 (HTML 가능)"),
      status: z
        .enum(["publish", "draft", "pending", "private"])
        .optional()
        .describe("게시글 상태 (기본값: draft)"),
      excerpt: z.string().optional().describe("게시글 요약"),
      author: z.number().int().min(1).optional().describe("작성자 ID"),
      featured_media: z.number().int().optional().describe("대표 이미지(미디어) ID"),
      categories: z
        .array(z.number().int())
        .optional()
        .describe("카테고리 ID 배열"),
      tags: z.array(z.number().int()).optional().describe("태그 ID 배열"),
    },
    async (params) => {
      logger.info("createPost 호출", {
        title: params.title,
        status: params.status,
        author: params.author,
        featured_media: params.featured_media,
        categories: params.categories,
      });
      try {
        const post = await wp.createPost(params);
        return {
          content: [{ type: "text", text: jsonText(cleanPost(post)) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- updatePost ---
  server.tool(
    "updatePost",
    "WordPress 게시글을 수정합니다.",
    {
      id: z.number().int().min(1).describe("수정할 게시글 ID"),
      title: z.string().optional().describe("변경할 제목"),
      content: z.string().optional().describe("변경할 내용 (HTML 가능)"),
      status: z
        .enum(["publish", "draft", "pending", "private"])
        .optional()
        .describe("변경할 상태"),
      excerpt: z.string().optional().describe("변경할 요약"),
      author: z.number().int().min(1).optional().describe("변경할 작성자 ID"),
      featured_media: z.number().int().optional().describe("변경할 대표 이미지(미디어) ID"),
      categories: z
        .array(z.number().int())
        .optional()
        .describe("변경할 카테고리 ID 배열"),
      tags: z.array(z.number().int()).optional().describe("변경할 태그 ID 배열"),
    },
    async ({ id, ...params }) => {
      logger.info(`updatePost 호출: id=${id}`, params);
      try {
        const post = await wp.updatePost(id, params);
        return {
          content: [{ type: "text", text: jsonText(cleanPost(post)) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- deletePost ---
  server.tool(
    "deletePost",
    "WordPress 게시글을 삭제합니다. force=true이면 휴지통을 건너뛰고 영구 삭제합니다.",
    {
      id: z.number().int().min(1).describe("삭제할 게시글 ID"),
      force: z
        .boolean()
        .optional()
        .describe("true이면 영구 삭제, false이면 휴지통 이동 (기본값: false)"),
    },
    async ({ id, force }) => {
      logger.info(`deletePost 호출: id=${id}, force=${force}`);
      try {
        const result = await wp.deletePost(id, force ?? false);
        return {
          content: [
            {
              type: "text",
              text: jsonText({
                deleted: result.deleted,
                post: cleanPost(result.previous),
              }),
            },
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: jsonText({ error: message }) }],
    isError: true,
  };
}
