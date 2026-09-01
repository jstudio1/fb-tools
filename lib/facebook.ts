const GRAPH_VERSION = "v19.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `ยังไม่ได้ตั้งค่า ${name} — สร้างไฟล์ .env.local จาก .env.local.example แล้วใส่ค่าให้ครบ`
    );
  }
  return value;
}

export function getLoginUrl(state: string) {
  const appId = requireEnv("FB_APP_ID");
  const redirectUri = requireEnv("FB_REDIRECT_URI");
  // Keep this list to exactly what the app uses — fewer scopes means fewer
  // "Get access" toggles you need to enable under App Review > Permissions and Features.
  const scope = ["pages_show_list", "pages_manage_posts"].join(",");

  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

async function graphGet(pathAndQuery: string) {
  const res = await fetch(`${GRAPH_BASE}${pathAndQuery}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || `Graph API error (${res.status})`);
  }
  return json;
}

export async function exchangeCodeForUserToken(code: string) {
  const appId = requireEnv("FB_APP_ID");
  const appSecret = requireEnv("FB_APP_SECRET");
  const redirectUri = requireEnv("FB_REDIRECT_URI");

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  const json = await graphGet(`/oauth/access_token?${params.toString()}`);
  return json.access_token as string;
}

/** Exchanges a short-lived user token for a long-lived one (~60 days). */
export async function getLongLivedUserToken(shortLivedToken: string) {
  const appId = requireEnv("FB_APP_ID");
  const appSecret = requireEnv("FB_APP_SECRET");

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const json = await graphGet(`/oauth/access_token?${params.toString()}`);
  return json.access_token as string;
}

export type FbPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: string;
};

/**
 * Lists every Page the logged-in user administers, with a Page access token each.
 * Page tokens derived from a long-lived user token do not expire on their own —
 * they only stop working if the user revokes the app or loses admin access to the page.
 */
export async function getUserPages(userAccessToken: string): Promise<FbPage[]> {
  const params = new URLSearchParams({
    access_token: userAccessToken,
    fields: "id,name,access_token,picture{url}",
    limit: "200",
  });

  const json = await graphGet(`/me/accounts?${params.toString()}`);
  const data = (json.data || []) as any[];
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    access_token: p.access_token,
    picture: p.picture?.data?.url,
  }));
}

export type PostResult =
  | { pageId: string; pageName: string; ok: true; postId: string; scheduled: boolean }
  | { pageId: string; pageName: string; ok: false; error: string };

type PageTarget = { id: string; name: string; access_token: string };

/** Uploads one photo to a Page without publishing it yet; returns its media id for later use in a feed post. */
async function uploadUnpublishedPhoto(
  page: PageTarget,
  image: Blob,
  filename: string
): Promise<string> {
  const form = new FormData();
  form.append("source", image, filename);
  form.append("published", "false");
  form.append("access_token", page.access_token);

  const res = await fetch(`${GRAPH_BASE}/${page.id}/photos`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  return json.id as string;
}

export type ScheduleOptions = {
  /** Unix timestamp (seconds) to publish at. Must be 10 min–75 days from now. Omit to publish immediately. */
  scheduledUnixTime?: number;
};

/**
 * Posts a message with zero or more images to a single Page, immediately or scheduled.
 * Always goes through the Page Feed endpoint so the same code path handles text-only,
 * single-image, multi-image, and scheduled posts uniformly.
 */
export async function postToPage(
  page: PageTarget,
  message: string,
  images: { blob: Blob; filename: string }[],
  schedule?: ScheduleOptions
): Promise<PostResult> {
  try {
    const mediaIds: string[] = [];
    for (const img of images) {
      const id = await uploadUnpublishedPhoto(page, img.blob, img.filename);
      mediaIds.push(id);
    }

    const form = new FormData();
    if (message) form.append("message", message);
    mediaIds.forEach((id, i) => {
      form.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }));
    });
    form.append("access_token", page.access_token);

    if (schedule?.scheduledUnixTime) {
      form.append("published", "false");
      form.append("scheduled_publish_time", String(schedule.scheduledUnixTime));
    }

    const res = await fetch(`${GRAPH_BASE}/${page.id}/feed`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();

    if (!res.ok || json.error) {
      return {
        pageId: page.id,
        pageName: page.name,
        ok: false,
        error: json?.error?.message || `HTTP ${res.status}`,
      };
    }

    return {
      pageId: page.id,
      pageName: page.name,
      ok: true,
      postId: json.id,
      scheduled: Boolean(schedule?.scheduledUnixTime),
    };
  } catch (err: any) {
    return {
      pageId: page.id,
      pageName: page.name,
      ok: false,
      error: err?.message || "โพสต์ไม่สำเร็จ",
    };
  }
}
