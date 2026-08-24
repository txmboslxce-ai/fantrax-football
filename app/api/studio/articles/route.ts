import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isWriter } from "@/lib/writer";
import { slugify } from "@/lib/slug";
import { ARTICLE_CATEGORIES } from "@/lib/articles";

type ArticlePayload = {
  id?: string;
  title?: string;
  excerpt?: string;
  body_markdown?: string;
  category?: string;
  cover_image_url?: string | null;
  status?: string;
};

async function ensureUniqueSlug(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  base: string,
  ignoreId?: string
): Promise<string> {
  if (!admin) throw new Error("Admin client unavailable");
  let candidate = base || "article";
  let suffix = 2;
  // Loop until no other row (excluding ignoreId) holds the slug.
  while (true) {
    const { data } = await admin
      .from("articles")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data || data.id === ignoreId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!(await isWriter(supabase, user.id))) {
    return NextResponse.json({ message: "Writer access required" }, { status: 403 });
  }

  let payload: ArticlePayload;
  try {
    payload = (await request.json()) as ArticlePayload;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body_markdown = typeof payload.body_markdown === "string" ? payload.body_markdown : "";
  const category = typeof payload.category === "string" ? payload.category : "";
  const excerpt = typeof payload.excerpt === "string" ? payload.excerpt.trim() : "";
  const cover_image_url =
    typeof payload.cover_image_url === "string" && payload.cover_image_url.trim()
      ? payload.cover_image_url.trim()
      : null;
  const status = payload.status === "published" ? "published" : "draft";

  if (!title) {
    return NextResponse.json({ message: "Title is required" }, { status: 400 });
  }
  if (!(ARTICLE_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ message: "Invalid category" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ message: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }

  try {
    // Fetch author display name for the byline.
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const author_name = profile?.display_name?.trim() || profile?.email?.split("@")[0] || "Staff";

    let resultSlug: string;

    if (payload.id) {
      // Update. Confirm the row belongs to this author.
      const { data: existing } = await admin
        .from("articles")
        .select("id, author_id, slug, status")
        .eq("id", payload.id)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ message: "Article not found" }, { status: 404 });
      }
      if (existing.author_id !== user.id) {
        return NextResponse.json({ message: "You can only edit your own articles" }, { status: 403 });
      }

      const becomingPublished = status === "published" && existing.status !== "published";
      const { error } = await admin
        .from("articles")
        .update({
          title,
          excerpt: excerpt || null,
          body_markdown,
          category,
          cover_image_url,
          status,
          ...(becomingPublished ? { published_at: new Date().toISOString() } : {}),
        })
        .eq("id", payload.id);
      if (error) throw new Error(error.message);
      resultSlug = existing.slug;
    } else {
      // Create.
      resultSlug = await ensureUniqueSlug(admin, slugify(title));
      const { error } = await admin.from("articles").insert({
        slug: resultSlug,
        title,
        excerpt: excerpt || null,
        body_markdown,
        category,
        cover_image_url,
        author_id: user.id,
        author_name,
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
      });
      if (error) throw new Error(error.message);
    }

    revalidatePath("/articles");
    revalidatePath(`/articles/${resultSlug}`);

    return NextResponse.json({ slug: resultSlug, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save article.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
