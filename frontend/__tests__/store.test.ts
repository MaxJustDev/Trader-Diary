import { describe, expect, it, beforeEach } from "vitest";
import { useMT5Store } from "@/lib/store";
import { MT5AccountInfo, MT5Position, EquityDataPoint } from "@/lib/types";

describe("useMT5Store slice independence", () => {
  beforeEach(() => {
    useMT5Store.setState({
      connected: false,
      connectedAccountId: null,
      accountInfo: null,
      positions: [],
      equityHistory: [],
    });
  });

  it("setPositions does not replace accountInfo reference", () => {
    const initialAccountInfo: MT5AccountInfo = {
      login: 1,
      name: "x",
      balance: 100,
      equity: 100,
      margin: 0,
      margin_free: 100,
      margin_level: 0,
      profit: 0,
      currency: "USD",
    };
    useMT5Store.setState({ accountInfo: initialAccountInfo });

    const before = useMT5Store.getState().accountInfo;
    useMT5Store.getState().setPositions([
      {
        ticket: 1,
        symbol: "EURUSD",
        type: "BUY",
        volume: 0.01,
        price_open: 1.1,
        sl: 0,
        tp: 0,
        profit: 0,
        time: new Date().toISOString(),
      },
    ]);
    const after = useMT5Store.getState().accountInfo;

    expect(after).toBe(before);
  });

  it("setAccountInfo does not replace positions reference", () => {
    const initialPositions = useMT5Store.getState().positions;

    useMT5Store.getState().setAccountInfo({
      login: 1,
      name: "x",
      balance: 50,
      equity: 50,
      margin: 0,
      margin_free: 50,
      margin_level: 0,
      profit: 0,
      currency: "USD",
    });

    expect(useMT5Store.getState().positions).toBe(initialPositions);
  });

  it("addEquityPoint caps history at 300 points", () => {
    const store = useMT5Store.getState();
    for (let i = 0; i < 350; i++) {
      store.addEquityPoint({ time: `${i}`, balance: i, equity: i });
    }
    expect(useMT5Store.getState().equityHistory.length).toBe(300);
  });
});
