import { Agent, type Dispatcher } from "undici";
import type { Config } from "./config.js";
import { logger } from "./logger.js";

export interface WPPost {
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
}

export interface ListPostsParams {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  orderby?: string;
  order?: string;
}

export interface CreatePostParams {
  title: string;
  content: string;
  slug?: string;
  status?: string;
  excerpt?: string;
  author?: number;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
}

export interface UpdatePostParams {
  title?: string;
  content?: string;
  slug?: string;
  status?: string;
  excerpt?: string;
  author?: number;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
}

// --- Category ---
export interface WPCategory {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
  parent: number;
}

export interface ListCategoriesParams {
  page?: number;
  per_page?: number;
  search?: string;
  orderby?: string;
  order?: string;
  hide_empty?: boolean;
  parent?: number;
}

export interface CreateCategoryParams {
  name: string;
  description?: string;
  slug?: string;
  parent?: number;
}

export interface UpdateCategoryParams {
  name?: string;
  description?: string;
  slug?: string;
  parent?: number;
}

// --- Tag ---
export interface WPTag {
  id: number;
  count: number;
  description: string;
  link: string;
  name: string;
  slug: string;
}

export interface ListTagsParams {
  page?: number;
  per_page?: number;
  search?: string;
  orderby?: string;
  order?: string;
  hide_empty?: boolean;
}

export interface CreateTagParams {
  name: string;
  description?: string;
  slug?: string;
}

export interface UpdateTagParams {
  name?: string;
  description?: string;
  slug?: string;
}

// --- Yoast SEO ---
export interface YoastSeoData {
  focuskw?: string;
  metadesc?: string;
  title?: string;
}

export interface YoastSeoResponse {
  id: number;
  focuskw: string;
  metadesc: string;
  title: string;
  [key: string]: unknown;
}

export class WordPressClient {
  private siteUrl: string;
  private baseUrl: string;
  private authHeader: string;
  private dispatcher: Dispatcher | undefined;

  constructor(config: Config) {
    this.siteUrl = config.baseUrl;
    this.baseUrl = `${config.baseUrl}/wp-json/wp/v2`;

    if (config.auth.type === "bearer") {
      this.authHeader = `Bearer ${config.auth.token}`;
    } else {
      const encoded = Buffer.from(
        `${config.auth.username}:${config.auth.password}`
      ).toString("base64");
      this.authHeader = `Basic ${encoded}`;
    }

    // 자체 서명 인증서 허용 (로컬 개발 환경)
    if (!config.tlsRejectUnauthorized) {
      logger.warn("TLS 인증서 검증이 비활성화되었습니다 (자체 서명 인증서 허용)");
      this.dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    logger.debug(`${method} ${url.toString()}`);

    const options: RequestInit & { dispatcher?: unknown } = {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
      logger.debug(`Request body: ${options.body}`);
    }

    // 자체 서명 인증서 허용 dispatcher 적용
    if (this.dispatcher) {
      options.dispatcher = this.dispatcher;
    }

    const response = await fetch(url.toString(), options as RequestInit);

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.message || errorBody;
      } catch {
        errorMessage = errorBody;
      }
      logger.error(
        `WordPress API 오류: ${response.status} ${response.statusText} - ${errorMessage}`
      );
      throw new Error(
        `WordPress API 오류 (${response.status}): ${errorMessage}`
      );
    }

    return response.json() as Promise<T>;
  }

  /** 커스텀 REST API 엔드포인트 요청 (wp/v2 이외의 경로) */
  private async requestCustom<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(`${this.siteUrl}/wp-json${path}`);

    logger.debug(`${method} ${url.toString()}`);

    const options: RequestInit & { dispatcher?: unknown } = {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = JSON.stringify(body);
      logger.debug(`Request body: ${options.body}`);
    }

    if (this.dispatcher) {
      options.dispatcher = this.dispatcher;
    }

    const response = await fetch(url.toString(), options as RequestInit);

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.message || errorBody;
      } catch {
        errorMessage = errorBody;
      }
      logger.error(
        `WordPress API 오류: ${response.status} ${response.statusText} - ${errorMessage}`
      );
      throw new Error(
        `WordPress API 오류 (${response.status}): ${errorMessage}`
      );
    }

    return response.json() as Promise<T>;
  }

  async listPosts(params: ListPostsParams = {}): Promise<WPPost[]> {
    return this.request<WPPost[]>("GET", "/posts", undefined, {
      page: params.page,
      per_page: params.per_page,
      search: params.search,
      status: params.status,
      orderby: params.orderby,
      order: params.order,
    });
  }

  async getPost(id: number): Promise<WPPost> {
    return this.request<WPPost>("GET", `/posts/${id}`);
  }

  async createPost(params: CreatePostParams): Promise<WPPost> {
    const result = await this.request<WPPost>("POST", "/posts", {
      title: params.title,
      content: params.content,
      slug: params.slug,
      status: params.status || "draft",
      excerpt: params.excerpt,
      author: params.author,
      featured_media: params.featured_media,
      categories: params.categories,
      tags: params.tags,
    });
    logger.info(
      `createPost 결과 - 요청 author: ${params.author}, 응답 author: ${result.author}, 요청 featured_media: ${params.featured_media}, 응답 featured_media: ${result.featured_media}`
    );
    return result;
  }

  async updatePost(id: number, params: UpdatePostParams): Promise<WPPost> {
    return this.request<WPPost>("PATCH", `/posts/${id}`, params);
  }

  async deletePost(
    id: number,
    force: boolean = false
  ): Promise<{ deleted: boolean; previous: WPPost }> {
    return this.request<{ deleted: boolean; previous: WPPost }>(
      "DELETE",
      `/posts/${id}`,
      undefined,
      { force: force ? "true" : undefined }
    );
  }

  // --- Categories ---

  async listCategories(params: ListCategoriesParams = {}): Promise<WPCategory[]> {
    return this.request<WPCategory[]>("GET", "/categories", undefined, {
      _fields: "id,name",
      page: params.page,
      per_page: params.per_page,
      search: params.search,
      orderby: params.orderby,
      order: params.order,
      hide_empty: params.hide_empty !== undefined ? String(params.hide_empty) : undefined,
      parent: params.parent,
    });
  }

  async getCategory(id: number): Promise<WPCategory> {
    return this.request<WPCategory>("GET", `/categories/${id}`);
  }

  async createCategory(params: CreateCategoryParams): Promise<WPCategory> {
    return this.request<WPCategory>("POST", "/categories", {
      name: params.name,
      description: params.description,
      slug: params.slug,
      parent: params.parent,
    });
  }

  async updateCategory(id: number, params: UpdateCategoryParams): Promise<WPCategory> {
    return this.request<WPCategory>("PATCH", `/categories/${id}`, params);
  }

  async deleteCategory(id: number, force: boolean = false): Promise<{ deleted: boolean; previous: WPCategory }> {
    return this.request<{ deleted: boolean; previous: WPCategory }>(
      "DELETE",
      `/categories/${id}`,
      undefined,
      { force: force ? "true" : undefined }
    );
  }

  // --- Tags ---

  async listTags(params: ListTagsParams = {}): Promise<WPTag[]> {
    return this.request<WPTag[]>("GET", "/tags", undefined, {
      _fields: "id,name",
      page: params.page,
      per_page: params.per_page,
      search: params.search,
      orderby: params.orderby,
      order: params.order,
      hide_empty: params.hide_empty !== undefined ? String(params.hide_empty) : undefined,
    });
  }

  async getTag(id: number): Promise<WPTag> {
    return this.request<WPTag>("GET", `/tags/${id}`);
  }

  async createTag(params: CreateTagParams): Promise<WPTag> {
    return this.request<WPTag>("POST", "/tags", {
      name: params.name,
      description: params.description,
      slug: params.slug,
    });
  }

  async updateTag(id: number, params: UpdateTagParams): Promise<WPTag> {
    return this.request<WPTag>("PATCH", `/tags/${id}`, params);
  }

  async deleteTag(id: number, force: boolean = false): Promise<{ deleted: boolean; previous: WPTag }> {
    return this.request<{ deleted: boolean; previous: WPTag }>(
      "DELETE",
      `/tags/${id}`,
      undefined,
      { force: force ? "true" : undefined }
    );
  }

  // --- Yoast SEO ---

  async updateYoastSeo(id: number, params: YoastSeoData): Promise<YoastSeoResponse> {
    return this.requestCustom<YoastSeoResponse>("POST", `/avia/v1/yoast-seo/${id}`, params);
  }

  // --- Avia Builder ---

  async activateBuilder(id: number): Promise<unknown> {
    return this.requestCustom<unknown>("POST", `/avia/v1/activate-builder/${id}`);
  }
}
