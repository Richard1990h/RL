import { PrismaClient } from "../src/generated/prisma/client";
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.video.updateMany({ where: { status: "PROCESSING" }, data: { status: "READY" } });
  console.log(`Updated ${r.count} video(s) from PROCESSING to READY`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
