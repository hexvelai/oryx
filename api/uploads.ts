import { handleUploads } from "../server/routes/uploads";

export default {
  async fetch(request: Request) {
    return handleUploads(request);
  },
};
