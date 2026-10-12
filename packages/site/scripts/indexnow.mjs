// Tell the search engines of the IndexNow protocol (Bing, Yandex, Seznam, Naver and others)
// about the pages of the site, after a deploy.
//
// The key is public by design: the engines fetch public/<key>.txt from the site to confirm that
// the request comes from the owner of the site. The URLs come from the deployed sitemap.xml.
//
// Usage: node scripts/indexnow.mjs <site-url>, for example https://mark1russell7.github.io/client/

const KEY = "626da9a7ba19ca53f2437cb462de76e7";

const site = process.argv[2];
if (!site || !site.endsWith("/")) {
  console.error("Give the URL of the site, with a final slash.");
  process.exit(1);
}

const sitemap = await fetch(new URL("sitemap.xml", site));
if (!sitemap.ok) {
  console.error(`sitemap.xml: HTTP ${sitemap.status}`);
  process.exit(1);
}
const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (urls.length === 0) {
  console.error("sitemap.xml has no <loc> entries.");
  process.exit(1);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(site).host,
    key: KEY,
    keyLocation: new URL(`${KEY}.txt`, site).href,
    urlList: urls.slice(0, 10000),
  }),
});
// 200 and 202 mean accepted. 422 means a URL does not belong to the host or the key.
console.log(`IndexNow: HTTP ${response.status} for ${urls.length} URLs`);
if (response.status !== 200 && response.status !== 202) {
  console.error(await response.text());
  process.exit(1);
}
