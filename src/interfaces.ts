import {SessionFlavor, Context} from "grammy"

export interface IBalanceData {
    totalEq: string,
    details: IAsset[]
}

export interface IAsset {
    ccy: string
    eqUsd: string,
    availBal: string
}

export interface ISelectedAsset {
    asset: string,
    part: string
}

export interface ISessionData {
  step: number,
  selectedAssets: ISelectedAsset[],
  selectedAsset: string,
  messageId: number
}

export type MyContext = Context & SessionFlavor<ISessionData>;

export interface IOrder {
    instId: string,
    tdMode: string,
    side: string,
    ordType: string,
    sz: string,
}