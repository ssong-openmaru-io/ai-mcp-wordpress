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
      slug: z.string().optional().describe("게시글 슬러그 (URL용)"),
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
        slug: params.slug,
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
      slug: z.string().optional().describe("변경할 슬러그 (URL용)"),
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

  // =====================
  // Category Tools
  // =====================

  // --- listCategories ---
  server.tool(
    "listCategories",
    "WordPress 카테고리 목록을 조회합니다. 페이지네이션, 검색, 정렬을 지원합니다.",
    {
      page: z.number().int().min(1).optional().describe("페이지 번호 (기본값: 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("페이지당 카테고리 수 (기본값: 10, 최대: 100)"),
      search: z.string().optional().describe("검색어"),
      orderby: z
        .enum(["id", "include", "name", "slug", "count", "description"])
        .optional()
        .describe("정렬 기준 (기본값: name)"),
      order: z.enum(["asc", "desc"]).optional().describe("정렬 방향 (기본값: asc)"),
      hide_empty: z.boolean().optional().describe("게시글이 없는 카테고리 숨기기 (기본값: false)"),
      parent: z.number().int().optional().describe("부모 카테고리 ID로 필터링"),
    },
    async (params) => {
      logger.info("listCategories 호출", params);
      try {
        const categories = await wp.listCategories(params);
        return {
          content: [{ type: "text", text: jsonText(categories) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- getCategory ---
  server.tool(
    "getCategory",
    "WordPress 카테고리 하나를 ID로 조회합니다.",
    {
      id: z.number().int().min(1).describe("카테고리 ID"),
    },
    async ({ id }) => {
      logger.info(`getCategory 호출: id=${id}`);
      try {
        const category = await wp.getCategory(id);
        return {
          content: [{ type: "text", text: jsonText(category) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- createCategory ---
  server.tool(
    "createCategory",
    "WordPress에 새 카테고리를 생성합니다.",
    {
      name: z.string().describe("카테고리 이름"),
      description: z.string().optional().describe("카테고리 설명"),
      slug: z.string().optional().describe("카테고리 슬러그 (URL용)"),
      parent: z.number().int().min(1).optional().describe("부모 카테고리 ID (계층 구조)"),
    },
    async (params) => {
      logger.info("createCategory 호출", { name: params.name, parent: params.parent });
      try {
        const category = await wp.createCategory(params);
        return {
          content: [{ type: "text", text: jsonText(category) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- updateCategory ---
  server.tool(
    "updateCategory",
    "WordPress 카테고리를 수정합니다.",
    {
      id: z.number().int().min(1).describe("수정할 카테고리 ID"),
      name: z.string().optional().describe("변경할 카테고리 이름"),
      description: z.string().optional().describe("변경할 카테고리 설명"),
      slug: z.string().optional().describe("변경할 카테고리 슬러그"),
      parent: z.number().int().optional().describe("변경할 부모 카테고리 ID"),
    },
    async ({ id, ...params }) => {
      logger.info(`updateCategory 호출: id=${id}`, params);
      try {
        const category = await wp.updateCategory(id, params);
        return {
          content: [{ type: "text", text: jsonText(category) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- deleteCategory ---
  server.tool(
    "deleteCategory",
    "WordPress 카테고리를 삭제합니다. 카테고리 삭제 시 force=true가 필요합니다.",
    {
      id: z.number().int().min(1).describe("삭제할 카테고리 ID"),
      force: z
        .boolean()
        .optional()
        .describe("true이면 영구 삭제 (기본값: false)"),
    },
    async ({ id, force }) => {
      logger.info(`deleteCategory 호출: id=${id}, force=${force}`);
      try {
        const result = await wp.deleteCategory(id, force ?? false);
        return {
          content: [
            {
              type: "text",
              text: jsonText({
                deleted: result.deleted,
                category: result.previous,
              }),
            },
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // =====================
  // Tag Tools
  // =====================

  // --- listTags ---
  server.tool(
    "listTags",
    "WordPress 태그 목록을 조회합니다. 페이지네이션, 검색, 정렬을 지원합니다.",
    {
      page: z.number().int().min(1).optional().describe("페이지 번호 (기본값: 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("페이지당 태그 수 (기본값: 10, 최대: 100)"),
      search: z.string().optional().describe("검색어"),
      orderby: z
        .enum(["id", "include", "name", "slug", "count", "description"])
        .optional()
        .describe("정렬 기준 (기본값: name)"),
      order: z.enum(["asc", "desc"]).optional().describe("정렬 방향 (기본값: asc)"),
      hide_empty: z.boolean().optional().describe("게시글이 없는 태그 숨기기 (기본값: false)"),
    },
    async (params) => {
      logger.info("listTags 호출", params);
      try {
        const tags = await wp.listTags(params);
        return {
          content: [{ type: "text", text: jsonText(tags) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- getTag ---
  server.tool(
    "getTag",
    "WordPress 태그 하나를 ID로 조회합니다.",
    {
      id: z.number().int().min(1).describe("태그 ID"),
    },
    async ({ id }) => {
      logger.info(`getTag 호출: id=${id}`);
      try {
        const tag = await wp.getTag(id);
        return {
          content: [{ type: "text", text: jsonText(tag) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- createTag ---
  server.tool(
    "createTag",
    "WordPress에 새 태그를 생성합니다.",
    {
      name: z.string().describe("태그 이름"),
      description: z.string().optional().describe("태그 설명"),
      slug: z.string().optional().describe("태그 슬러그 (URL용)"),
    },
    async (params) => {
      logger.info("createTag 호출", { name: params.name });
      try {
        const tag = await wp.createTag(params);
        return {
          content: [{ type: "text", text: jsonText(tag) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- updateTag ---
  server.tool(
    "updateTag",
    "WordPress 태그를 수정합니다.",
    {
      id: z.number().int().min(1).describe("수정할 태그 ID"),
      name: z.string().optional().describe("변경할 태그 이름"),
      description: z.string().optional().describe("변경할 태그 설명"),
      slug: z.string().optional().describe("변경할 태그 슬러그"),
    },
    async ({ id, ...params }) => {
      logger.info(`updateTag 호출: id=${id}`, params);
      try {
        const tag = await wp.updateTag(id, params);
        return {
          content: [{ type: "text", text: jsonText(tag) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- deleteTag ---
  server.tool(
    "deleteTag",
    "WordPress 태그를 삭제합니다. 태그 삭제 시 force=true가 필요합니다.",
    {
      id: z.number().int().min(1).describe("삭제할 태그 ID"),
      force: z
        .boolean()
        .optional()
        .describe("true이면 영구 삭제 (기본값: false)"),
    },
    async ({ id, force }) => {
      logger.info(`deleteTag 호출: id=${id}, force=${force}`);
      try {
        const result = await wp.deleteTag(id, force ?? false);
        return {
          content: [
            {
              type: "text",
              text: jsonText({
                deleted: result.deleted,
                tag: result.previous,
              }),
            },
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // =====================
  // Yoast SEO Tools
  // =====================

  // --- activateBuilder ---
  server.tool(
    "activateBuilder",
    "WordPress 게시글의 Avia 빌더를 활성화합니다.",
    {
      id: z.number().int().min(1).describe("게시글 ID"),
    },
    async ({ id }) => {
      logger.info(`activateBuilder 호출: id=${id}`);
      try {
        const result = await wp.activateBuilder(id);
        return {
          content: [{ type: "text", text: jsonText(result) }],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  // --- updateYoastSeo ---
  server.tool(
    "updateYoastSeo",
    "WordPress 게시글의 Yoast SEO 메타데이터를 설정합니다. (focuskw, metadesc, title)",
    {
      id: z.number().int().min(1).describe("게시글 ID"),
      focuskw: z.string().optional().describe("초점 키워드 (Focus Keyword)"),
      metadesc: z.string().optional().describe("메타 설명 (Meta Description)"),
      title: z.string().optional().describe("SEO 제목 (SEO Title)"),
    },
    async ({ id, ...params }) => {
      logger.info(`updateYoastSeo 호출: id=${id}`, params);
      try {
        const seo = await wp.updateYoastSeo(id, params);
        return {
          content: [{ type: "text", text: jsonText(seo) }],
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
