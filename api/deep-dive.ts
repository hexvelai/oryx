import { handleDeepDive } from "../server/routes/deep-dives";

export default {
  async fetch(request: Request) {
    return handleDeepDive(request);
  },
};
