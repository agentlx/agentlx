import { createFileRoute } from "@tanstack/react-router";
import { getProfilePhotoForViewer, getViewerFromCookieHeader } from "@/server/auth.server";

export const Route = createFileRoute("/api/profile-photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const viewer = await getViewerFromCookieHeader(request.headers.get("cookie") ?? undefined);
        if (!viewer) {
          return new Response("Sessao expirada.", { status: 401 });
        }

        const photo = await getProfilePhotoForViewer(viewer.id);
        if (!photo) {
          return new Response("Foto nao encontrada.", { status: 404 });
        }

        const etag = photo.updatedAt ? `"profile-photo-${viewer.id}-${photo.updatedAt}"` : null;
        if (etag && request.headers.get("if-none-match") === etag) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: etag,
            },
          });
        }

        const headers = new Headers({
          "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
          "Content-Length": String(photo.data.byteLength),
          "Content-Type": photo.mime,
          "X-Content-Type-Options": "nosniff",
        });

        if (etag) {
          headers.set("ETag", etag);
        }

        return new Response(photo.data, { headers });
      },
    },
  },
});
