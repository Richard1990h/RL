// Trivia Battle - Host asks questions, fastest correct answer wins points, 5 rounds

import type { GameState, GameAction, TickHandler, GameLogicHandler } from "./game-engine";

interface TriviaQuestion {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
}

export function createTriviaHandlers(): { tick: TickHandler; action: GameLogicHandler } {
  return {
    tick: triviaTick,
    action: triviaAction,
  };
}

function triviaTick(state: GameState, deltaMs: number): GameState {
  if (state.phase !== "active") return state;

  const questionActive = state.data.questionActive as boolean;
  if (!questionActive) return state;

  state.timeRemaining -= deltaMs / 1000;

  if (state.timeRemaining <= 0) {
    // Time's up for this question
    state.data.questionActive = false;
    state.data.showingAnswer = true;
    state.data.answerRevealTimer = 3; // Show answer for 3 seconds

    // Move to next question after reveal
    return state;
  }

  // Check if answer reveal timer is active
  const answerTimer = state.data.answerRevealTimer as number;
  if (answerTimer > 0) {
    state.data.answerRevealTimer = answerTimer - deltaMs / 1000;
    if (answerTimer - deltaMs / 1000 <= 0) {
      state.data.showingAnswer = false;
      state.data.answerRevealTimer = 0;

      // Next question or end game
      const questionIndex = (state.data.questionIndex as number) || 0;
      const questions = (state.data.questions as TriviaQuestion[]) || [];

      if (questionIndex + 1 >= questions.length) {
        // Game over
        state.phase = "finished";
        const sorted = Object.values(state.players)
          .filter((p) => !p.isEliminated)
          .sort((a, b) => b.score - a.score);
        state.winner = sorted[0]?.userId || null;
      } else {
        // Next question
        state.data.questionIndex = questionIndex + 1;
        state.data.questionActive = true;
        state.data.answeredThisRound = {};
        state.timeRemaining = questions[questionIndex + 1].timeLimit;
        state.round = questionIndex + 2;
      }
    }
  }

  return state;
}

function triviaAction(state: GameState, action: GameAction): GameState {
  const player = state.players[action.userId];
  if (!player || player.isEliminated) return state;

  switch (action.type) {
    case "set_questions": {
      // Host sets questions
      state.data.questions = action.payload.questions;
      state.data.questionIndex = 0;
      state.data.questionActive = true;
      state.data.answeredThisRound = {};
      const questions = action.payload.questions as TriviaQuestion[];
      state.timeRemaining = questions[0]?.timeLimit || 15;
      break;
    }
    case "answer": {
      const questionActive = state.data.questionActive as boolean;
      if (!questionActive) break;

      const answered = (state.data.answeredThisRound as Record<string, boolean>) || {};
      if (answered[action.userId]) break; // Already answered

      const answerIndex = action.payload.answerIndex as number;
      const questionIndex = (state.data.questionIndex as number) || 0;
      const questions = (state.data.questions as TriviaQuestion[]) || [];
      const question = questions[questionIndex];

      if (!question) break;

      answered[action.userId] = true;
      state.data.answeredThisRound = answered;

      if (answerIndex === question.correctIndex) {
        // Correct! Score based on speed
        const timeBonus = Math.ceil(state.timeRemaining);
        const basePoints = 100;
        player.score += basePoints + timeBonus * 10;

        // Track first correct answer
        if (!state.data.firstCorrect) {
          state.data.firstCorrect = action.userId;
          player.score += 50; // Bonus for first correct
        }
      }
      break;
    }
    case "donate": {
      const amount = (action.payload.amount as number) || 0;
      player.score += Math.floor(amount / 2); // Donations give half their value as points
      break;
    }
  }

  return state;
}
