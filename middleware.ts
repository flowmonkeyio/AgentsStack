/**
 * Clerk Authentication Middleware
 *
 * @see /docs/reference/CLERK_AUTH.md
 */

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/agents",
  "/api/agents/discover",
  "/api/webhooks(.*)", // Webhook routes for external agents
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    // Clerk v6: auth.protect() returns a promise
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (auth as any).protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
