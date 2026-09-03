import { json, now, type Db, type Row } from '../lib/db.ts'
import { handle as toHandle, id } from '../lib/ids.ts'

export type Article = {
  id: string
  blogId: string
  storeId: string
  title: string
  handle: string
  excerpt: string
  body: string
  image: string
  tags: string[]
  status: 'draft' | 'scheduled' | 'published'
  publishedAt: string | null
  createdAt: string
}

export type Blog = { id: string; storeId: string; title: string; handle: string; articles: Article[] }

function rowToArticle(row: Row): Article {
  return {
    id: row.id as string,
    blogId: row.blog_id as string,
    storeId: row.store_id as string,
    title: row.title as string,
    handle: row.handle as string,
    excerpt: row.excerpt as string,
    body: row.body as string,
    image: row.image as string,
    tags: json(row.tags, [] as string[]),
    status: row.status as Article['status'],
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

export function listBlogs(db: Db, storeId: string): Blog[] {
  return db.all('SELECT * FROM blogs WHERE store_id = ? ORDER BY created_at', storeId).map((row) => ({
    id: row.id as string,
    storeId,
    title: row.title as string,
    handle: row.handle as string,
    articles: db.all('SELECT * FROM articles WHERE blog_id = ? ORDER BY created_at DESC', row.id).map(rowToArticle),
  }))
}

export function createBlog(db: Db, storeId: string, title: string): Blog {
  const blogId = id('blog')
  db.insert('blogs', { id: blogId, store_id: storeId, title, handle: toHandle(title), created_at: now() })
  return listBlogs(db, storeId).find((blog) => blog.id === blogId) as Blog
}

export function createArticle(
  db: Db,
  storeId: string,
  blogId: string,
  input: { title: string; body?: string; excerpt?: string; image?: string; tags?: string[]; status?: Article['status'] },
): Article {
  const articleId = id('art')
  const status = input.status ?? 'published'
  db.insert('articles', {
    id: articleId,
    blog_id: blogId,
    store_id: storeId,
    title: input.title,
    handle: toHandle(input.title),
    excerpt: input.excerpt ?? input.body?.slice(0, 160) ?? '',
    body: input.body ?? '',
    image: input.image ?? '',
    tags: input.tags ?? [],
    status,
    published_at: status === 'published' ? now() : null,
    created_at: now(),
  })
  return rowToArticle(db.one('SELECT * FROM articles WHERE id = ?', articleId) as Row)
}

export function findArticle(db: Db, storeId: string, blogHandle: string, articleHandle: string): { blog: Blog; article: Article } | null {
  const blog = listBlogs(db, storeId).find((entry) => entry.handle === blogHandle)
  const article = blog?.articles.find((entry) => entry.handle === articleHandle && entry.status === 'published')
  return blog && article ? { blog, article } : null
}
