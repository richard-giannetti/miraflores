import { getCollection, type CollectionEntry } from "astro:content";
import { postPath, type Lang } from ".";

type Post = CollectionEntry<"blog">;

export const postLang = (p: Post): Lang => (p.id.startsWith("es/") ? "es" : "en");
export const postSlug = (p: Post) => p.id.split("/").pop()!;
const enSlug = (p: Post) => (postLang(p) === "en" ? postSlug(p) : p.data.translationOf);

export async function getPosts(lang: Lang) {
  return (await getCollection("blog", (p) => postLang(p) === lang)).sort((a, b) => +b.data.pubDate - +a.data.pubDate);
}

// The same post's URL in each language that has it.
export async function postAlternates(post: Post) {
  const key = enSlug(post);
  const all = await getCollection("blog", (p) => enSlug(p) === key);
  return Object.fromEntries(all.map((p) => [postLang(p), postPath(postLang(p), postSlug(p))])) as Partial<Record<Lang, string>>;
}
