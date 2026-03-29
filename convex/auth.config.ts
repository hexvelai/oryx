const defaultIssuer = "https://prime-halibut-45.clerk.accounts.dev";
const issuer =
  process.env.CLERK_JWT_ISSUER_DOMAIN ??
  process.env.CLERK_FRONTEND_API_URL ??
  defaultIssuer;

export default {
  providers: [
    {
      domain: issuer,
      applicationID: "convex",
    },
  ],
};
