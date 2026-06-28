export default {
  providers: [
    {
      // Convex Auth uses the deployment itself as the OIDC issuer.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
