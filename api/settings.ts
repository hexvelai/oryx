import { handleSettings } from "../server/routes/settings";

export default {
  async fetch(request: Request) {
    return handleSettings(request);
  },
};
