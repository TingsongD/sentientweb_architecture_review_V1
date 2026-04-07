import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __sentientPrisma__: PrismaClient | undefined;
}

const prisma =
  global.__sentientPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__sentientPrisma__ = prisma;
}

export default prisma;
