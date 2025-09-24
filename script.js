const EMOJIS = ["🍎", "🐱", "🌸", "⭐", "🐶", "🍋", "🍓", "⚡"];
const SHOW_DURATION_MS = 5000;
const MEMORIZE_DURATION_SECONDS = SHOW_DURATION_MS / 1000;
const SELECTION_DURATION_SECONDS = 10;
const BASE_CARD_COUNT = 3;
const BEST_SCORE_KEY = "memoryAdventureBest";
const MAX_MISTAKES = 1;
const DIFFICULTY_CONFIG = {
  easy: { size: 3 },
  medium: { size: 5 },
  hard: { size: 7 }
};
const RANK_TABLE = {
  easy: {
    label: "初級",
    world: "村の冒険者見習い",
    titles: ["ぼんやり村人", "見習い冒険者", "小さな勇者", "村の英雄", "天才勇者"]
  },
  medium: {
    label: "中級",
    world: "城下町や森の試練",
    titles: ["旅の挑戦者", "森の探検家", "王国の戦士", "記憶の騎士", "スーパー勇者"]
  },
  hard: {
    label: "上級",
    world: "伝説の神殿",
    titles: ["無謀な挑戦者", "記憶忍者", "賢者", "記憶の王", "記憶神"]
  }
};

const cardList = document.getElementById("card-list");
const messageEl = document.getElementById("message");
const currentLevelEl = document.getElementById("current-level");
const bestScoreEl = document.getElementById("best-score");
const countdownValueEl = document.getElementById("countdown-value");
const countdownCircle = document.querySelector(".countdown-circle");
const restartBtn = document.getElementById("restart-btn");
const endGameBtn = document.getElementById("end-game-btn");
const choicesContainer = document.querySelector(".choices");
const selectionList = document.getElementById("selection-list");
const difficultySelect = document.getElementById("difficulty-select");
const statusPopup = document.getElementById("status-popup");
const statusText = statusPopup ? statusPopup.querySelector(".status-text") : null;
const statusActions = statusPopup ? document.getElementById("status-actions") : null;
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");

let currentLevel = 1;
let bestScore = 0;
let cardSequence = [];
let remainingAnswers = [];
let countdownIntervalId = null;
let acceptingGuesses = false;
let playerSelections = [];
let countdownRemaining = MEMORIZE_DURATION_SECONDS;
let selectedDifficulty = difficultySelect ? difficultySelect.value : "easy";
let choiceButtons = [];
let mistakesLeft = MAX_MISTAKES;
let countdownWarningThreshold = 2;
let countdownCompleteCallback = null;

function init() {
  loadBestScore();
  attachEventListeners();
  showStartOverlay();
}

function loadBestScore() {
  const stored = localStorage.getItem(BEST_SCORE_KEY);
  bestScore = stored ? Number(stored) : 0;
  if (Number.isNaN(bestScore)) {
    bestScore = 0;
  }
  updateBestScoreDisplay();
}

function attachEventListeners() {
  if (difficultySelect) {
    difficultySelect.addEventListener("change", (event) => {
      selectedDifficulty = event.target.value;
      startGame();
    });
  }

  restartBtn.addEventListener("click", () => {
    returnToStartScreen();
  });

  if (endGameBtn) {
    endGameBtn.addEventListener("click", () => {
      endGameManually();
    });
  }

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startGame();
    });
  }
}

function startGame() {
  currentLevel = 1;
  restartBtn.classList.add("hidden");
  messageEl.textContent = "";
  if (difficultySelect) {
    difficultySelect.value = selectedDifficulty;
  }
  stopCountdown();
  setFeedback("neutral");
  hideStatusPopup();
  hideStartOverlay();
  beginLevel();
}

function beginLevel() {
  stopCountdown();
  acceptingGuesses = false;
  renderChoices();
  setChoicesEnabled(false);
  mistakesLeft = MAX_MISTAKES;
  setFeedback("neutral");
  hideStatusPopup();

  updateCurrentLevelDisplay();
  maybeUpdateBestScore();

  cardSequence = generateSequenceForLevel(currentLevel);
  remainingAnswers = cardSequence.slice();
  resetSelectionHistory();

  renderCards(cardSequence);
  setMessage("カードを覚えてください…", "info");
  startMemorizeCountdown();
}

function generateSequenceForLevel(level) {
  const count = BASE_CARD_COUNT + level - 1;
  const pool = getActiveEmojiPool();
  const sequence = [];
  for (let i = 0; i < count; i += 1) {
    const emoji = pool[Math.floor(Math.random() * pool.length)];
    sequence.push(emoji);
  }
  return sequence;
}

function renderCards(cards) {
  cardList.innerHTML = "";
  cards.forEach((emoji) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.emoji = emoji;
    card.textContent = emoji;
    cardList.appendChild(card);
  });
}

function coverCards() {
  cardList.querySelectorAll(".card").forEach((card) => {
    card.classList.add("covered");
    card.setAttribute("aria-hidden", "true");
  });
}

function revealCards() {
  cardList.querySelectorAll(".card").forEach((card) => {
    card.classList.remove("covered");
    card.removeAttribute("aria-hidden");
  });
}

function handleChoice(selectedEmoji) {
  if (!acceptingGuesses) {
    return;
  }

  const clickedButton = choiceButtons.find((btn) => btn.dataset.emoji === selectedEmoji);
  playerSelections.push(selectedEmoji);
  renderSelectionHistory();

  const matchIndex = remainingAnswers.indexOf(selectedEmoji);

  if (matchIndex === -1) {
    handleIncorrectSelection(selectedEmoji);
    return;
  }

  remainingAnswers.splice(matchIndex, 1);
  if (clickedButton) {
    clickedButton.dataset.result = "◎";
    clickedButton.classList.add("choice-success");
    clickedButton.classList.remove("choice-fail");
  }
  setFeedback("success");

  if (remainingAnswers.length === 0) {
    stopCountdown();
    acceptingGuesses = false;
    setChoicesEnabled(false);
    setMessage("正解！次のレベルへ進みます。", "success");
    showStatusPopup("success", "正解！！");
    window.setTimeout(() => {
      currentLevel += 1;
      beginLevel();
    }, 1200);
  } else {
    setMessage(`正解！あと${remainingAnswers.length}枚。`, "success");
  }
}

function handleGameOver(selectedEmoji, options = {}) {
  stopCountdown();
  updateCountdownDisplay(0);
  acceptingGuesses = false;
  setChoicesEnabled(false);
  revealCards();

  const failureMessage = options.messageOverride
    ? options.messageOverride
    : `残念！ ${selectedEmoji} は表示されていませんでした。`;
  setMessage(failureMessage, "error");
  setFeedback("error");
  if (options.popupType) {
    showStatusPopup(options.popupType, options.popupMessage || failureMessage, options.actions);
  } else {
    showStatusPopup("fail", "残念！", [
      {
        label: "もう一度挑戦する",
        className: "restart",
        onClick: () => returnToStartScreen()
      }
    ]);
  }
  restartBtn.classList.remove("hidden");
}

function setChoicesEnabled(isEnabled) {
  choiceButtons.forEach((button) => {
    button.disabled = !isEnabled;
  });
}

function setMessage(text) {
  messageEl.textContent = text;
}

function updateCurrentLevelDisplay() {
  currentLevelEl.textContent = currentLevel;
}

function maybeUpdateBestScore() {
  if (currentLevel > bestScore) {
    bestScore = currentLevel;
    updateBestScoreDisplay();
    persistBestScore();
  }
}

function updateBestScoreDisplay() {
  bestScoreEl.textContent = bestScore;
}

function startMemorizeCountdown() {
  startCountdown(MEMORIZE_DURATION_SECONDS, "memorize", () => {
    coverCards();
    acceptingGuesses = true;
    setChoicesEnabled(true);
    setMessage(`表示された絵文字を選んでください！（制限時間${SELECTION_DURATION_SECONDS}秒）`, "info");
    startSelectionCountdown();
  });
}

function startSelectionCountdown() {
  startCountdown(SELECTION_DURATION_SECONDS, "select", handleTimeOver);
}

function startCountdown(totalSeconds, mode, onComplete) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  stopCountdown();
  countdownWarningThreshold = mode === "select" ? 3 : 2;
  countdownRemaining = seconds;
  countdownCompleteCallback = typeof onComplete === "function" ? onComplete : null;

  if (countdownCircle) {
    countdownCircle.classList.remove("warning", "mode-select");
    if (mode === "select") {
      countdownCircle.classList.add("mode-select");
    }
  }

  updateCountdownDisplay(countdownRemaining);

  if (seconds === 0) {
    const callback = countdownCompleteCallback;
    countdownCompleteCallback = null;
    if (callback) {
      callback();
    }
    return;
  }

  countdownIntervalId = window.setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining <= 0) {
      const callback = countdownCompleteCallback;
      stopCountdown();
      updateCountdownDisplay(0);
      countdownCompleteCallback = null;
      if (callback) {
        callback();
      }
    } else {
      updateCountdownDisplay(countdownRemaining);
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownIntervalId !== null) {
    window.clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
  countdownCompleteCallback = null;
  if (countdownCircle) {
    countdownCircle.classList.remove("warning", "mode-select");
  }
}

function updateCountdownDisplay(value) {
  if (!countdownValueEl) {
    return;
  }

  const displayValue = Math.max(0, Math.floor(value));
  countdownValueEl.textContent = displayValue;

  const shouldWarn = displayValue <= countdownWarningThreshold && displayValue > 0;
  if (countdownCircle) {
    countdownCircle.classList.toggle("warning", shouldWarn);
  }
}

function resetSelectionHistory() {
  playerSelections = [];
  renderSelectionHistory();
}

function renderSelectionHistory() {
  selectionList.innerHTML = "";

  if (playerSelections.length === 0) {
    const placeholder = document.createElement("span");
    placeholder.className = "selection-chip placeholder";
    placeholder.textContent = "未選択";
    selectionList.appendChild(placeholder);
    return;
  }

  playerSelections.forEach((emoji, index) => {
    const chip = document.createElement("span");
    chip.className = "selection-chip";
    chip.textContent = emoji;
    chip.setAttribute("aria-label", `${index + 1}番目 ${emoji}`);
    selectionList.appendChild(chip);
  });
}

function handleIncorrectSelection(selectedEmoji) {
  const button = choiceButtons.find((btn) => btn.dataset.emoji === selectedEmoji);
  if (button) {
    button.disabled = true;
    button.dataset.result = "×";
    button.classList.add("choice-fail");
    button.classList.remove("choice-success");
  }

  if (mistakesLeft > 0) {
    mistakesLeft -= 1;
    setFeedback("error");
    setMessage(`×！もう一度挑戦しましょう。（残りリトライ${mistakesLeft}回）`, "error");
    hideStatusPopup();
    return;
  }

  handleGameOver(selectedEmoji);
}

function handleTimeOver() {
  if (!acceptingGuesses || remainingAnswers.length === 0) {
    return;
  }
  handleGameOver(null, {
    messageOverride: "時間切れ！タイムオーバーです。",
    popupType: "timeout",
    popupMessage: "タイムオーバー！",
    actions: [
      {
        label: "もう一度遊ぶ",
        className: "restart",
        onClick: () => returnToStartScreen()
      }
    ]
  });
}

function getActiveEmojiPool() {
  const config = DIFFICULTY_CONFIG[selectedDifficulty] || DIFFICULTY_CONFIG.easy;
  return EMOJIS.slice(0, config.size);
}

function renderChoices() {
  choicesContainer.innerHTML = "";
  const pool = getActiveEmojiPool();
  choiceButtons = pool.map((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-btn";
    button.dataset.emoji = emoji;
    button.textContent = emoji;
    button.dataset.result = "";
    button.setAttribute("aria-label", `${emoji} を選ぶ`);
    button.disabled = true;
    button.addEventListener("click", () => handleChoice(emoji));
    choicesContainer.appendChild(button);
    return button;
  });
}

function setFeedback(state) {
  const iconEl = document.getElementById("feedback-icon");
  if (!iconEl) {
    return;
  }

  iconEl.textContent = "";
  iconEl.className = "";

  if (state === "success") {
    iconEl.textContent = "◎";
    iconEl.classList.add("success");
  } else if (state === "error") {
    iconEl.textContent = "×";
    iconEl.classList.add("error");
  }
}

function showStatusPopup(type, text, actions = []) {
  if (!statusPopup || !statusText) {
    return;
  }

  statusPopup.className = "status-popup";
  if (type) {
    statusPopup.classList.add(type);
  }
  statusPopup.classList.remove("hidden");
  statusText.textContent = text;
  statusText.style.animation = "none";
  void statusText.offsetWidth;
  statusText.style.animation = "pop 0.45s ease-out forwards";

  if (statusActions) {
    statusActions.innerHTML = "";
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `popup-btn ${action.className || ""}`.trim();
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      statusActions.appendChild(button);
    });
  }
}

function hideStatusPopup() {
  if (!statusPopup) {
    return;
  }
  statusPopup.classList.add("hidden");
  statusPopup.classList.remove("success", "timeout", "ended");
  if (statusActions) {
    statusActions.innerHTML = "";
  }
}

function endGameManually() {
  stopCountdown();
  acceptingGuesses = false;
  setChoicesEnabled(false);
  revealCards();
  setFeedback("neutral");

  const rankInfo = getRankInfo(selectedDifficulty, currentLevel);
  const summary = [
    `${rankInfo.difficultyLabel}（カード${rankInfo.cardCount}枚：${rankInfo.worldName}）`,
    `現在のレベル: Lv${currentLevel}`,
    `称号: ${rankInfo.title}`,
    `最高スコア: ${bestScore}`
  ].join("\n");
  setMessage("ゲームを終了しました。いつでも再挑戦できます。");
  showStatusPopup("ended", summary, [
    {
      label: "もう一度遊ぶ",
      className: "restart",
      onClick: () => returnToStartScreen()
    },
    {
      label: "結果をシェア",
      className: "share",
      onClick: () => shareResult(summary)
    }
  ]);
  restartBtn.classList.remove("hidden");
}

function getRankInfo(difficulty, level) {
  const meta = RANK_TABLE[difficulty] || RANK_TABLE.easy;
  const cardCount = DIFFICULTY_CONFIG[difficulty]?.size || DIFFICULTY_CONFIG.easy.size;
  const titles = meta.titles;
  const index = Math.max(1, Math.min(level, titles.length)) - 1;
  let title = titles[index] || titles[titles.length - 1];
  if (level > titles.length) {
    title = `${title}+`;
  }
  return {
    difficultyLabel: meta.label,
    worldName: meta.world,
    title,
    cardCount
  };
}

function shareResult(summary) {
  const shareText = `記憶アドベンチャーで挑戦！\n${summary}\nあなたも試してみてね！`;

  if (typeof navigator !== "undefined" && navigator.share) {
    navigator
      .share({ text: shareText })
      .catch(() => {
        fallbackCopyToClipboard(shareText);
      });
  } else {
    fallbackCopyToClipboard(shareText);
  }
}

function fallbackCopyToClipboard(text) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    window.prompt("以下の内容をコピーしてください", text);
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => {
      setMessage("結果をクリップボードにコピーしました！", "success");
    })
    .catch(() => {
      setMessage("コピーに失敗しました。手動でコピーしてください。", "error");
    });
}

function showStartOverlay() {
  if (!startOverlay) {
    return;
  }
  startOverlay.classList.remove("hidden");
}

function hideStartOverlay() {
  if (!startOverlay) {
    return;
  }
  startOverlay.classList.add("hidden");
}

function returnToStartScreen() {
  stopCountdown();
  acceptingGuesses = false;
  setChoicesEnabled(false);
  showStartOverlay();
  hideStatusPopup();
  restartBtn.classList.add("hidden");
  setMessage("");
  cardList.innerHTML = "";
  resetSelectionHistory();
}

function persistBestScore() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch (error) {
    // localStorage が使用できない環境では保存を諦める
  }
}

// 初期化
init();
