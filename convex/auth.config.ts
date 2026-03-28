export default {
  providers: [
    {
      // You can find your Clerk Issuer URL in the Clerk Dashboard
      // under "API Keys" -> "Advanced" -> "Convex"
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://clerk.your-domain.com",
      applicationID: "convex",
    },
  ],
};
