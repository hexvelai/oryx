import { errorResponse, json, parseJson } from "../api-utils";
import { addUploads, removeUpload } from "../deep-dive-store";

type UploadBody = {
  deepDiveId: string;
  files: Array<{ name: string; type: string; url: string }>;
};

export async function handleUploads(request: Request) {
  try {
    if (request.method === "POST") {
      const body = await parseJson<UploadBody>(request);
      if (!body.deepDiveId) return errorResponse(new Error("Missing deep dive id"), 400);
      await addUploads(body.deepDiveId, body.files ?? []);
      return json({ ok: true }, { status: 201 });
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const deepDiveId = url.searchParams.get("deepDiveId");
      const uploadId = url.searchParams.get("uploadId");
      if (!deepDiveId || !uploadId) return errorResponse(new Error("Missing upload arguments"), 400);
      await removeUpload(deepDiveId, uploadId);
      return json({ ok: true });
    }

    return errorResponse(new Error("Method not allowed"), 405);
  } catch (error) {
    return errorResponse(error);
  }
}
