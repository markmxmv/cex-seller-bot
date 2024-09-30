import dotenv from "dotenv";
import {
  Bot,
  GrammyError,
  HttpError,
  InlineKeyboard,
  Keyboard,
  session
} from "grammy";
import {
  getBalanceOkx,
  sellAllOkx,
  sellManuallyOkx,
} from "./exchanges/okx/okx.js";
import { IAsset, IBalanceData, ISelectedAsset, ISessionData, MyContext } from "./interfaces.js";
import { InlineKeyboardButton } from "grammy/types";
dotenv.config();

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  throw new Error("Bot token is not defined in environment variables.");
}

const bot = new Bot<MyContext>(botToken);



bot.use(session({initial: (): ISessionData => ({ step: 0, selectedAssets: [], selectedAsset: '', messageId: 0 }),}),);

bot.api.setMyCommands([
  {
    command: "menu",
    description: "launch bot",
  },
  {
    command: "about",
    description: "bot info",
  },
  {
    command: "config",
    description: "manage your API keys",
  },
]);

bot.command(["start", "menu"], async (ctx) => {
  const actionsKeyboard = new Keyboard()
    .text("get balance")
    .row()
    .text("sell all")
    .row()
    .text("sell manually")
    .resized();
  await ctx.reply("<b>waiting for a new task</b>", {
    reply_markup: actionsKeyboard,
    parse_mode: "HTML",
  });
});

bot.hears("get balance", async (ctx) => {
  await ctx.reply("work in progress...");
  const balanceData: IBalanceData | undefined = await getBalanceOkx();
  const assets: string[] = [];
  balanceData?.details.map((a: IAsset) => {
    if (Number(a.eqUsd) > 1) {
      assets.push(`<i>${a.ccy}: ${Number(a.eqUsd).toFixed(2)} USD</i>\n\n`);
    }
  });
  await ctx.reply(
    `<b>total balance</b>: <i>${Number(balanceData?.totalEq).toFixed(2)} USD</i>\n-------\n<b>your assets</b>:\n\n${assets.join("")}`,
    { parse_mode: "HTML" },
  );
});

bot.hears("sell all", async (ctx) => {
  await ctx.reply("work in progress...");
  const res = await sellAllOkx();
  await ctx.reply(res, { parse_mode: "HTML" });
});

bot.hears("sell manually", async (ctx) => {
  ctx.session.step = 1;
  const balanceData = await getBalanceOkx();
  const assetsButtons: InlineKeyboardButton[] = [];

  balanceData?.details.map((a: IAsset) => {
    if (Number(a.eqUsd) > 1 && a.ccy != "USDT") {
      assetsButtons.push(InlineKeyboard.text(a.ccy, `asset:${a.ccy}`));
    }
  });

  if (assetsButtons.length === 0) {
    ctx.reply("no assets avaliable");
    ctx.session.step = 0;
    return
  }

  const inlineKeyboard = new InlineKeyboard([assetsButtons]);

  const message = await ctx.reply(
    "<b>choose an asset and select part you want to sell</b>",
    { parse_mode: "HTML", reply_markup: inlineKeyboard },
  );

  ctx.session.messageId = message.message_id;
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;

  console.log(`Received callback query data: ${data}`);

  if (data.startsWith("asset:")) {
    const asset = data.split(":")[1];
    ctx.session.selectedAsset = asset;
    ctx.session.step = 2;

    const fractionKeyboard = new InlineKeyboard()
      .text("25%", "25")
      .text("50%", "50")
      .row()
      .text("75%", "75")
      .text("100%", "100");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      ctx.session.messageId,
      `you selected <b>${ctx.session.selectedAsset}</b>\nnow select the part you want to sell:`,
      { parse_mode: "HTML", reply_markup: fractionKeyboard },
    );
  } else if (
    ctx.session.step === 2 &&
    ["25", "50", "75", "100"].includes(data)
  ) {
    const part = data;
    ctx.session.selectedAssets.push({
      asset: ctx.session.selectedAsset,
      part: part,
    });

    ctx.session.step = 1;
    const selectedAssetsText = ctx.session.selectedAssets
      .map((a: ISelectedAsset) => `${a.asset}: ${a.part}%`)
      .join("\n");

    const balanceData = await getBalanceOkx();
    const assetsButtons: InlineKeyboardButton[] = [];

    balanceData?.details.forEach((a: IAsset) => {
      if (Number(a.eqUsd) > 1 && a.ccy !== "USDT") {
        assetsButtons.push(InlineKeyboard.text(a.ccy, `asset:${a.ccy}`));
      }
    });

    const inlineKeyboard = new InlineKeyboard([assetsButtons])
      .row()
      .text("proceed", "action:proceed")
      .row()
      .text("cancel", "action:cancel");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      ctx.session.messageId,
      `<b>choose another asset or proceed</b>\n\n<b>selected assets:</b>\n<i>${selectedAssetsText}</i>`,
      { parse_mode: "HTML", reply_markup: inlineKeyboard },
    );
  } else if (data === "action:proceed") {
    const selectedAssetsText = ctx.session.selectedAssets
      .map((a: ISelectedAsset) => `${a.asset}: ${a.part}%`)
      .join("\n");

    await ctx.api.editMessageText(
      ctx.chat!.id,
      ctx.session.messageId,
      `Proceeding with the following assets:\n ${selectedAssetsText}`,
      { parse_mode: "HTML" },
    );

    const selectedAssetsArr: ISelectedAsset[] = [];
    ctx.session.selectedAssets.map((a) => {
      selectedAssetsArr.push({ asset: a.asset, part: a.part });
    });

    const res = await sellManuallyOkx(selectedAssetsArr);
    await ctx.reply(res, { parse_mode: "HTML" });
    ctx.session.selectedAssets = [];

    ctx.session.step = 0;
  } else if (data === "action:cancel") {
    ctx.session.selectedAssets = [];
    const messageId = ctx.session.messageId;
    ctx.api.deleteMessage(ctx.chat!.id, messageId);
    await ctx.reply("<b>waiting for a new task</b>", {
      parse_mode: "HTML",
    });
    ctx.session.step = 0;
  }

  await ctx.answerCallbackQuery();
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}: `);
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error(`Error in request: ${e.description}: `);
  } else if (e instanceof HttpError) {
    console.error(`Could not connect to Telegram ${e}: `);
  } else {
    console.error(`Unknown error${e}: `);
  }
});

bot.start();
