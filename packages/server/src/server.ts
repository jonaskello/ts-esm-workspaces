import Koa from "koa";
// import * as mount from "koa-mount";
import compress from "koa-compress";
import cors from "koa-cors";
import { appendMessage } from "@app/shared";

// if (process.env.NODE_ENV !== "production") {
//   // tslint:disable-next-line:no-var-requires no-require-imports
//   require("dotenv").config();
// }

const x = 11;

async function startServer(): Promise<void> {
  let app = new Koa();
  // TODO .env get port from there

  // app.use(cors());
  app.use(compress());
  app.use(async function (ctx: Koa.Context): Promise<void> {
    ctx.body = { aa: appendMessage("cc") };
    ctx.set("content-type", "application/json");
  });

  const httpServer = app.listen(parseInt("4000", 10), process.env.ADDRESS);
  console.log(appendMessage("asd"));
  console.log(`Service listening on port ${4000}`); //tslint:disable-line
  // Stop server on CTRL+C
  process.on("SIGINT", () => {
    //graceful shutdown
    httpServer.close();
    process.exit();
  });
}

startServer();
