import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import PositionsTable from "@/components/mt5/PositionsTable";
import { useMT5Store } from "@/lib/store";

describe("PositionsTable", () => {
  it("renders without throwing on empty positions", () => {
    useMT5Store.setState({ positions: [] });
    const { container } = render(<PositionsTable />);
    expect(container).toBeTruthy();
  });

  it("renders without throwing with one position", () => {
    useMT5Store.setState({
      positions: [
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
      ],
    });
    const { container } = render(<PositionsTable />);
    expect(container).toBeTruthy();
  });
});
