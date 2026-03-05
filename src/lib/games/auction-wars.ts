// Auction Wars - Items presented, real-time bidding with credits, anti-snipe timer

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

interface AuctionItem {
  id: string;
  name: string;
  description: string;
  startingBid: number;
  imageKey: string;
}

export function createAuctionHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: auctionTick,
    action: auctionAction,
  };
}

function auctionTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

  const auctionActive = state.data.auctionActive as boolean;

  // Result display phase (runs when auctionActive is false)
  if (!auctionActive) {
    const resultTimer = state.data.resultTimer as number;
    if (resultTimer > 0) {
      state.data.resultTimer = resultTimer - deltaMs / 1000;
      if (resultTimer - deltaMs / 1000 <= 0) {
        state.data.showingResult = false;
        state.data.resultTimer = 0;

        // Next item or end
        const itemIndex = (state.data.itemIndex as number) || 0;
        const items = (state.data.items as AuctionItem[]) || [];

        if (itemIndex + 1 >= items.length) {
          state.phase = "finished";
          // Winner is whoever won the most items (or spent the most)
          const wonItems = (state.data.wonItems as Record<string, string[]>) || {};
          let maxItems = 0;
          let winnerId: string | null = null;
          for (const [userId, userItems] of Object.entries(wonItems)) {
            if (userItems.length > maxItems) {
              maxItems = userItems.length;
              winnerId = userId;
            }
          }
          state.winner = winnerId;
        } else {
          // Next item
          state.data.itemIndex = itemIndex + 1;
          state.data.auctionActive = true;
          state.data.highBid = items[itemIndex + 1].startingBid;
          state.data.highBidder = null;
          state.data.bidHistory = [];
          state.timeRemaining = 30; // 30 seconds per item
          state.round = itemIndex + 2;
        }
      }
    }
    return state;
  }

  // Active auction countdown
  state.timeRemaining -= deltaMs / 1000;

  if (state.timeRemaining <= 0) {
    // Auction ended for this item
    state.data.auctionActive = false;
    const highBidder = state.data.highBidder as string | null;
    const highBid = (state.data.highBid as number) || 0;

    if (highBidder) {
      // Award item to highest bidder
      const wonItems = (state.data.wonItems as Record<string, string[]>) || {};
      if (!wonItems[highBidder]) wonItems[highBidder] = [];
      const currentItem = (state.data.items as AuctionItem[])?.[(state.data.itemIndex as number) || 0];
      if (currentItem) {
        wonItems[highBidder].push(currentItem.id);
      }
      state.data.wonItems = wonItems;

      // Deduct credits from winner's score (score tracks spending)
      if (state.players[highBidder]) {
        state.players[highBidder].score += highBid;
      }
    }

    // Show result for 3 seconds then move to next
    state.data.showingResult = true;
    state.data.resultTimer = 3;
  }

  return state;
}

function auctionAction(state: GameState, action: GameAction): GameState {
  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "set_items": {
      state.data.items = action.payload.items;
      state.data.itemIndex = 0;
      state.data.auctionActive = true;
      const items = action.payload.items as AuctionItem[];
      state.data.highBid = items[0]?.startingBid || 1;
      state.data.highBidder = null;
      state.data.bidHistory = [];
      state.data.wonItems = {};
      state.timeRemaining = 30;
      break;
    }
    case "bid": {
      const auctionActive = state.data.auctionActive as boolean;
      if (!auctionActive) break;

      const bidAmount = action.payload.amount as number;
      const currentHigh = (state.data.highBid as number) || 0;

      if (bidAmount <= currentHigh) break; // Must bid higher

      state.data.highBid = bidAmount;
      state.data.highBidder = action.userId;

      // Track bid history
      const history = (state.data.bidHistory as Array<{ userId: string; amount: number; time: number }>) || [];
      history.push({ userId: action.userId, amount: bidAmount, time: Date.now() });
      state.data.bidHistory = history;

      // Anti-snipe: extend timer if bid in last 5 seconds
      if (state.timeRemaining < 5) {
        state.timeRemaining = 10;
      }
      break;
    }
    case "donate": {
      const amount = (action.payload.amount as number) || 0;
      player.score += amount;
      break;
    }
  }

  return state;
}
