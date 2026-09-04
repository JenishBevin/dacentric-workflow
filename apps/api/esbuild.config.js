// Production bundling for the API. We bundle to a single dist/server.js so
// the "@dacentric/types" path alias resolves correctly without needing
// tsc-alias or a runtime path-mapping shim. Prisma's client (and other
// native/binary deps) are kept external and resolved normally from
// node_modules at runtime.
const esbuild = require("esbuild");
const path = require("path");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src/server.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    outfile: path.join(__dirname, "dist/server.js"),
    sourcemap: true,
    external: [
      "@prisma/client",
      ".prisma/client",
      "bcryptjs",
      "sharp",
      "exceljs",
      "nodemailer",
      "multer",
      "@aws-sdk/client-s3",
    ],
    logLevel: "info",
  })
  .catch(() => process.exit(1));
