import { handleDeepDives } from "../server/routes/deep-dives";

export default {
  async fetch(request: Request) {
    return handleDeepDives(request);
  },
};
