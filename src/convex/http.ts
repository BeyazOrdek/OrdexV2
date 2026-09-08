import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { gifsProxy } from "./tenor";

const http = httpRouter();

auth.addHttpRoutes(http);
// Tenor GIF proxy (public GET; handler also answers CORS preflight).
http.route({
  path: "/api/gifs",
  method: "GET",
  handler: gifsProxy,
});
http.route({
  path: "/api/gifs",
  method: "OPTIONS",
  handler: gifsProxy,
});

export default http;
