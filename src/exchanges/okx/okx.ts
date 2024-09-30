import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import { IAsset, IBalanceData, IOrder, ISelectedAsset } from "../../interfaces";

dotenv.config();

const secret = process.env.API_SECRET_OKX;
if (!secret) {
  throw new Error('No secret key')
}

const OKX_BASE_URL = "https://www.okx.com";

function createSign(secret: string, timestamp: string, method: string, path: string, order?: string) {
  if (order) {
    const prehash = timestamp + method + path + order;
    const hash = crypto
      .createHmac("sha256", secret)
      .update(prehash)
      .digest("base64");
    return hash;
  } else {
    const prehash = timestamp + method + path;
    const hash = crypto
      .createHmac("sha256", secret)
      .update(prehash)
      .digest("base64");
    return hash;
  }
}

export async function getBalanceOkx() {
  const timestamp = new Date().toISOString();

  try {
    const res = await axios.get(`${OKX_BASE_URL}/api/v5/account/balance`, {
      headers: {
        "OK-ACCESS-KEY": process.env.API_OKX,
        "OK-ACCESS-SIGN": createSign(
          secret!,
          timestamp,
          "GET",
          "/api/v5/account/balance",
        ),
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": process.env.PASSPHRASE_OKX,
      },
    });

    const balanceData = {
      totalEq: res.data.data[0].totalEq,
      details: res.data.data[0].details,
    };

    return balanceData;
  } catch (error) {
    console.error(error);
  }
}

export async function sellAllOkx() {
  const balanceData: IBalanceData | undefined = await getBalanceOkx();
  const multipleOrder: IOrder[] = [];
  balanceData?.details.map((a: IAsset) => {
    if (Number(a.eqUsd) > 1) {
      multipleOrder.push({
        instId: `${a.ccy}-USDT`,
        tdMode: "cash",
        side: "sell",
        ordType: "market",
        sz: `${a.availBal}`,
      });
    }
  });

  if (
    (multipleOrder.length === 1 && multipleOrder[0].instId === "USDT-USDT") ||
    multipleOrder.length == 1
  ) {
    return "<b>no assets avaliable to sell</b>";
  }

  const timestamp = new Date().toISOString();

  try {
    await axios.post(
      `${OKX_BASE_URL}/api/v5/trade/batch-orders`,
      multipleOrder,
      {
        headers: {
          "Content-Type": "application/json",
          "OK-ACCESS-KEY": process.env.API_OKX,
          "OK-ACCESS-SIGN": createSign(
            secret!,
            timestamp,
            "POST",
            "/api/v5/trade/batch-orders",
            JSON.stringify(multipleOrder),
          ),
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": process.env.PASSPHRASE_OKX,
        },
      },
    );
    return "<b>Your assets have been sold</b>";
  } catch (error) {
    console.error(error);
    return `<b>error:</b>\n<i>${error}</i>`;
  }
}

export async function getAvaliablBalance(asset: string) {
  const balanceData: IBalanceData | undefined = await getBalanceOkx();
  const assetData: IAsset | undefined = balanceData?.details.find((a) => a.ccy == asset);
  return Number(assetData?.availBal);
}

export async function sellManuallyOkx(positions: ISelectedAsset[]) {
  const multipleOrder: IOrder[] = [];
  await Promise.all(
    positions.map(async (a: ISelectedAsset) => {
      const availableBalance = await getAvaliablBalance(a.asset);
      multipleOrder.push({
        instId: `${a.asset}-USDT`,
        tdMode: "cash",
        side: "sell",
        ordType: "market",
        sz: `${(availableBalance / 100) * Number(a.part)}`,
      });
    }),
  );

  if (
    (multipleOrder.length === 1 && multipleOrder[0].instId === "USDT-USDT") ||
    multipleOrder.length == 0
  ) {
    return "<b>no assets avaliable to sell</b>";
  }

  const timestamp = new Date().toISOString();

  try {
    const sellResponse = await axios.post(
      `${OKX_BASE_URL}/api/v5/trade/batch-orders`,
      multipleOrder,
      {
        headers: {
          "Content-Type": "application/json",
          "OK-ACCESS-KEY": process.env.API_OKX,
          "OK-ACCESS-SIGN": createSign(
            secret!,
            timestamp,
            "POST",
            "/api/v5/trade/batch-orders",
            JSON.stringify(multipleOrder),
          ),
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": process.env.PASSPHRASE_OKX,
        },
      },
    );
    return "<b>Chosen assets have been sold</b>";
  } catch (error) {
    console.error(error);
    return `<b>error:</b>\n<i>${error}</i>`;
  }
}
