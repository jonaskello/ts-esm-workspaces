import Koa from "koa";
import { appendMessage } from "@app/shared";

export async function startServer(): Promise<void> {
  let app = new Koa();
  app.use(async function (ctx: Koa.Context): Promise<void> {
    ctx.body = { aa: appendMessage("cc") };
    ctx.set("content-type", "application/json");
  });

  const httpServer = app.listen(parseInt("4000", 10), process.env.ADDRESS);
  console.log(appendMessage("asd"));
  console.log(`Service listening on port ${4000}`);
  // Stop server on CTRL+C
  process.on("SIGINT", () => {
    httpServer.close();
    process.exit();
  });
}
