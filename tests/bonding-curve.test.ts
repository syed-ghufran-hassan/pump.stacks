import { Cl, cvToValue } from "@stacks/transactions";
import { beforeEach, describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const user1 = accounts.get("wallet_1")!;
const user2 = accounts.get("wallet_2")!;
const user3 = accounts.get("wallet_3")!;
const randomUser = accounts.get("wallet_4")!;

// Mock token contract address (SIP-010 compliant)
const mockTokenAddress = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-token";
// Mock DEX contract address
const mockDexAddress = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-dex";

describe("Linear Bonding Curve Contract", () => {
  describe("Mathematical Functions", () => {
    it("should calculate correct buy price for first purchase", () => {
      const buyPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(0), Cl.uint(1000)],
        user1
      );

      // Price = (tokens * (2*current + tokens) / 2) * SLOPE / PRECISION
      // = (1000 * (0 + 1000) / 2) * 2000 / 1000000
      // = (1000 * 1000 / 2) * 2000 / 1000000
      // = (500000) * 2000 / 1000000 = 1000
      expect(cvToValue(buyPrice.result)).toBe(1000);
    });

    it("should calculate increasing prices for subsequent purchases", () => {
      // First buy: 1000 tokens
      const price1 = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(0), Cl.uint(1000)],
        user1
      );

      // Second buy: 1000 tokens at supply 1000
      const price2 = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(1000), Cl.uint(1000)],
        user1
      );

      // Third buy: 1000 tokens at supply 2000
      const price3 = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(2000), Cl.uint(1000)],
        user1
      );

      expect(cvToValue(price1.result)).toBe(1000);
      expect(cvToValue(price2.result)).toBe(3000); // Higher price
      expect(cvToValue(price3.result)).toBe(5000); // Even higher
    });

    it("should calculate correct sell prices", () => {
      // Buy price at supply 3000 for 1000 tokens
      const buyPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(2000), Cl.uint(1000)],
        user1
      );

      // Sell price at supply 3000 for 1000 tokens (selling back)
      const sellPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-sell-price",
        [Cl.uint(3000), Cl.uint(1000)],
        user1
      );

      // Sell price should be lower than buy price (spread)
      expect(cvToValue(sellPrice.result)).toBeLessThan(cvToValue(buyPrice.result));
      expect(cvToValue(sellPrice.result)).toBe(3000);
    });

    it("should handle large numbers without overflow", () => {
      const largeSupply = 1000000000;
      const largeAmount = 1000000;

      const buyPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(largeSupply), Cl.uint(largeAmount)],
        user1
      );

      // Should return a number without error
      expect(cvToValue(buyPrice.result)).toBeDefined();
    });
  });

  describe("Buy Functionality", () => {
    beforeEach(() => {
      // Reset curve state
      simnet.setDataVar("bonding-curve", "current-token-supply", Cl.uint(0));
      simnet.setDataVar("bonding-curve", "curve-active", Cl.bool(true));
    });

    it("should allow users to buy tokens", () => {
      const buyAmount = 1000;
      const expectedPrice = 1000; // Calculated from math

      const buy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(buyAmount)],
        user1
      );

      expect(buy.result).toBeOk(Cl.bool(true));

      // Check STX transfer event
      expect(buy.events[0].event).toBe("stx_transfer_event");
      expect(buy.events[0].data.amount).toBe(expectedPrice.toString());
      expect(buy.events[0].data.sender).toBe(user1);

      // Check token mint event
      expect(buy.events[1].event).toBe("ft_mint_event");
      expect(buy.events[1].data.amount).toBe(buyAmount.toString());
      expect(buy.events[1].data.recipient).toBe(user1);

      // Check supply update
      const supply = simnet.getDataVar("bonding-curve", "current-token-supply");
      expect(supply).toBeUint(buyAmount);
    });

    it("should allow multiple buys from same user", () => {
      // First buy
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      // Second buy
      const secondBuy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      expect(secondBuy.result).toBeOk(Cl.bool(true));
      
      // Should pay higher price second time
      expect(secondBuy.events[0].data.amount).toBe("3000"); // Higher price

      const supply = simnet.getDataVar("bonding-curve", "current-token-supply");
      expect(supply).toBeUint(2000);
    });

    it("should allow multiple users to buy", () => {
      // User1 buys
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      // User2 buys
      const user2Buy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user2
      );

      expect(user2Buy.result).toBeOk(Cl.bool(true));
      expect(user2Buy.events[0].data.amount).toBe("3000");

      const supply = simnet.getDataVar("bonding-curve", "current-token-supply");
      expect(supply).toBeUint(2000);
    });

    it("should reject buys when curve is inactive", () => {
      // Deactivate curve
      simnet.setDataVar("bonding-curve", "curve-active", Cl.bool(false));

      const buy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      expect(buy.result).toBeErr(Cl.uint(2002)); // ERR-CURVE-CLOSED
    });

    it("should handle zero amount buys", () => {
      const buy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(0)],
        user1
      );

      // Price would be 0, should still work
      expect(buy.result).toBeOk(Cl.bool(true));
      expect(buy.events[0].data.amount).toBe("0");
    });
  });

  describe("Sell Functionality", () => {
    beforeEach(() => {
      // Setup: Buy some tokens first
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(3000)],
        user1
      );
    });

    it("should allow users to sell tokens", () => {
      const sellAmount = 1000;
      const expectedPrice = 5000; // Price at supply 3000 selling 1000

      const sell = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(sellAmount)],
        user1
      );

      expect(sell.result).toBeOk(Cl.uint(expectedPrice));

      // Check burn event
      expect(sell.events[0].event).toBe("ft_burn_event");
      expect(sell.events[0].data.amount).toBe(sellAmount.toString());
      expect(sell.events[0].data.sender).toBe(user1);

      // Check STX transfer event
      expect(sell.events[1].event).toBe("stx_transfer_event");
      expect(sell.events[1].data.amount).toBe(expectedPrice.toString());
      expect(sell.events[1].data.recipient).toBe(user1);

      // Check supply decreased
      const supply = simnet.getDataVar("bonding-curve", "current-token-supply");
      expect(supply).toBeUint(2000);
    });

    it("should allow partial sells", () => {
      // Sell half
      const sell1 = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      expect(sell1.result).toBeOk(Cl.uint(5000));

      // Sell remaining
      const sell2 = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(2000)],
        user1
      );

      expect(sell2.result).toBeOk(Cl.uint(2000)); // Lower price for remaining

      const supply = simnet.getDataVar("bonding-curve", "current-token-supply");
      expect(supply).toBeUint(0);
    });

    it("should reject sells when curve is inactive", () => {
      simnet.setDataVar("bonding-curve", "curve-active", Cl.bool(false));

      const sell = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      expect(sell.result).toBeErr(Cl.uint(2002)); // ERR-CURVE-CLOSED
    });

    it("should handle sells by different users", () => {
      // User2 buys tokens
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user2
      );

      // User2 sells
      const sell = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user2
      );

      expect(sell.result).toBeOk(Cl.uint(7000)); // Price at supply 4000
    });
  });

  describe("Graduation/Migration", () => {
    beforeEach(() => {
      // Reset state
      simnet.setDataVar("bonding-curve", "current-token-supply", Cl.uint(0));
      simnet.setDataVar("bonding-curve", "curve-active", Cl.bool(true));
    });

    it("should allow graduation when target supply is reached", () => {
      // Buy enough to reach target (TARGET-SUPPLY = 1000000000000)
      // For testing, we'll use a smaller amount and mock
      
      // Set supply to target
      simnet.setDataVar("bonding-curve", "current-token-supply", Cl.uint(1000000000000));

      // Add some STX balance to contract
      // Note: In real test, you'd need to fund contract with STX

      const graduate = simnet.callPublicFn(
        "bonding-curve",
        "graduate",
        [Cl.principal(mockTokenAddress), Cl.principal(mockDexAddress)],
        deployer
      );

      expect(graduate.result).toBeOk(Cl.bool(true));

      // Check curve deactivated
      const active = simnet.getDataVar("bonding-curve", "curve-active");
      expect(active).toBe(Cl.bool(false));

      // Check remaining tokens minted to contract
      // Check add-liquidity called on DEX
    });

    it("should prevent graduation before target supply", () => {
      // Supply below target
      simnet.setDataVar("bonding-curve", "current-token-supply", Cl.uint(500000000000));

      const graduate = simnet.callPublicFn(
        "bonding-curve",
        "graduate",
        [Cl.principal(mockTokenAddress), Cl.principal(mockDexAddress)],
        deployer
      );

      expect(graduate.result).toBeErr(Cl.uint(2001)); // ERR-TARGET-NOT-MET
    });

    it("should prevent graduation if curve already closed", () => {
      simnet.setDataVar("bonding-curve", "curve-active", Cl.bool(false));
      simnet.setDataVar("bonding-curve", "current-token-supply", Cl.uint(1000000000000));

      const graduate = simnet.callPublicFn(
        "bonding-curve",
        "graduate",
        [Cl.principal(mockTokenAddress), Cl.principal(mockDexAddress)],
        deployer
      );

      expect(graduate.result).toBeErr(Cl.uint(2002)); // ERR-CURVE-CLOSED
    });
  });

  describe("Edge Cases", () => {
    it("should maintain price invariants (buy > sell)", () => {
      const supply = 5000;
      const amount = 1000;

      const buyPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(supply), Cl.uint(amount)],
        user1
      );

      const sellPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-sell-price",
        [Cl.uint(supply + amount), Cl.uint(amount)],
        user1
      );

      expect(cvToValue(buyPrice.result)).toBeGreaterThan(cvToValue(sellPrice.result));
    });

    it("should handle maximum supply values", () => {
      const maxUint = 340282366920938463463374607431768211455; // uint max approximation

      const buyPrice = simnet.callReadOnlyFn(
        "bonding-curve",
        "get-buy-price",
        [Cl.uint(maxUint), Cl.uint(1)],
        user1
      );

      // Should handle without overflow
      expect(cvToValue(buyPrice.result)).toBeDefined();
    });

    it("should prevent selling more than owned", () => {
      // Buy 1000 tokens
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      // Try to sell 2000 tokens
      const sell = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(2000)],
        user1
      );

      // Should fail at token contract burn (insufficient balance)
      expect(sell.result).toBeErr(Cl.uint(1)); // Token contract error
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete buy/sell cycle", () => {
      // Buy
      const buy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(5000)],
        user1
      );
      const paidAmount = parseInt(buy.events[0].data.amount);

      // Sell half
      const sell1 = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(2500)],
        user1
      );
      const received1 = (sell1.result as any).value.value;

      // Sell remaining
      const sell2 = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(2500)],
        user1
      );
      const received2 = (sell2.result as any).value.value;

      // Total received should be less than paid (trading fee/spread)
      expect(received1 + received2).toBeLessThan(paidAmount);
    });

    it("should handle multiple users trading", () => {
      // User1 buys
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(2000)],
        user1
      );

      // User2 buys
      simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(2000)],
        user2
      );

      // User3 buys
      const user3Buy = simnet.callPublicFn(
        "bonding-curve",
        "buy",
        [Cl.principal(mockTokenAddress), Cl.uint(2000)],
        user3
      );

      // Later buys pay higher price
      expect(user3Buy.events[0].data.amount).toBe("18000"); // High price at supply 4000

      // User1 sells
      const user1Sell = simnet.callPublicFn(
        "bonding-curve",
        "sell",
        [Cl.principal(mockTokenAddress), Cl.uint(1000)],
        user1
      );

      expect(user1Sell.result).toBeOk(Cl.uint(13000)); // Good price
    });
  });
});
