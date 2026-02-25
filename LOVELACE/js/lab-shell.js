(function () {
  const DEFAULT_HARD_STEP_LIMIT = 200000;
  const DEFAULT_YIELD_EVERY = 1500;

  const GRAPHEME_SEGMENTER = (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function")
    ? new Intl.Segmenter("ru", { granularity: "grapheme" })
    : null;

  function splitGraphemes(text) {
    const src = String(text || "");
    if (!src) return [];
    if (!GRAPHEME_SEGMENTER) return Array.from(src);
    const out = [];
    for (const item of GRAPHEME_SEGMENTER.segment(src)) out.push(item.segment);
    return out;
  }

  function getGraphemeBoundaries(text) {
    const src = String(text || "");
    const boundaries = [0];
    if (!src.length) return boundaries;
    let idx = 0;
    for (const g of splitGraphemes(src)) {
      idx += g.length;
      boundaries.push(idx);
    }
    if (boundaries[boundaries.length - 1] !== src.length) boundaries.push(src.length);
    return boundaries;
  }

  function boundaryAtOrBefore(text, pos) {
    const src = String(text || "");
    const clamped = Math.max(0, Math.min(src.length, pos));
    const boundaries = getGraphemeBoundaries(src);
    let out = 0;
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      if (b <= clamped) out = b;
      else break;
    }
    return out;
  }

  function boundaryAtOrAfter(text, pos) {
    const src = String(text || "");
    const clamped = Math.max(0, Math.min(src.length, pos));
    const boundaries = getGraphemeBoundaries(src);
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      if (b >= clamped) return b;
    }
    return src.length;
  }

  function previousBoundary(text, pos) {
    const src = String(text || "");
    const clamped = Math.max(0, Math.min(src.length, pos));
    const boundaries = getGraphemeBoundaries(src);
    let out = 0;
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      if (b < clamped) out = b;
      else break;
    }
    return out;
  }

  function nextBoundary(text, pos) {
    const src = String(text || "");
    const clamped = Math.max(0, Math.min(src.length, pos));
    const boundaries = getGraphemeBoundaries(src);
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      if (b > clamped) return b;
    }
    return src.length;
  }

  function graphemeRangeContaining(text, pos) {
    const src = String(text || "");
    if (!src.length) return { start: 0, end: 0 };
    const clamped = Math.max(0, Math.min(src.length - 1, pos));
    const boundaries = getGraphemeBoundaries(src);
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      if (clamped >= start && clamped < end) return { start, end };
    }
    const last = boundaries[boundaries.length - 1];
    return { start: last, end: last };
  }

  function findLineStart(text, pos) {
    if (pos <= 0) return 0;
    const idx = text.lastIndexOf("\n", pos - 1);
    return idx === -1 ? 0 : idx + 1;
  }

  function findLineEnd(text, pos) {
    const idx = text.indexOf("\n", pos);
    return idx === -1 ? text.length : idx;
  }

  function graphemeIndexAtPosition(text, pos) {
    const src = String(text || "");
    const clamped = Math.max(0, Math.min(src.length, pos));
    const boundaries = getGraphemeBoundaries(src);
    let idx = 0;
    for (let i = 0; i < boundaries.length; i++) {
      if (boundaries[i] <= clamped) idx = i;
      else break;
    }
    return idx;
  }

  function positionAtGraphemeIndex(text, index) {
    const boundaries = getGraphemeBoundaries(text);
    const safeIdx = Math.max(0, Math.min(index, boundaries.length - 1));
    return boundaries[safeIdx];
  }

  function normalizeCodeLine(line) {
    return String(line || "").replace(/\s+/g, "");
  }

  function makeError(kind, line, message) {
    const err = new Error(message || "");
    err.kind = kind;
    err.line = line;
    return err;
  }

  function formatLineOnlyError(err) {
    const line = err && Number.isInteger(err.line) ? err.line : 0;
    if (line > 0) return `Ошибка в строке ${line}.`;
    return "Ошибка.";
  }

  function boot(options) {
    const config = options && typeof options === "object" ? options : {};
    const domain = config.domain;
    if (!domain || typeof domain.parseProgram !== "function" || typeof domain.executeProgram !== "function") {
      throw new Error("LovelaceLabShell: invalid domain config");
    }

    const codeInputEl = document.getElementById("codeInput");
    const codeLineNumbersEl = document.getElementById("codeLineNumbers");
    const runBtn = document.getElementById("runBtn");
    const resetBtn = document.getElementById("resetBtn");
    const addTestBtn = document.getElementById("addTestBtn");
    const resetTestsBtn = document.getElementById("resetTestsBtn");
    const testListEl = document.getElementById("testList");
    const testOutputsEl = document.getElementById("testOutputs");
    const testsPanelEl = document.getElementById("testsPanel");
    const taskButtonsEl = document.getElementById("taskButtons");
    const taskSubtasksEl = document.getElementById("taskSubtasks");
    const taskTextWrapEl = document.getElementById("taskTextWrap");
    const taskTextEl = document.getElementById("taskText");
    const statusBoxEl = document.getElementById("statusBox");
    const stepCountEl = document.getElementById("stepCount");
    const emojiKeyboardEl = document.getElementById("emojiKeyboard");
    const codePhrasePanelEl = document.getElementById("codePhrasePanel");

    const fixedTestsByScenario = (config.fixedTestsByScenario && typeof config.fixedTestsByScenario === "object")
      ? config.fixedTestsByScenario
      : null;
    const useFixedTests = Boolean(fixedTestsByScenario);
    const onScenarioChange = typeof config.onScenarioChange === "function" ? config.onScenarioChange : null;
    const onRunComplete = typeof config.onRunComplete === "function" ? config.onRunComplete : null;

    if (!codeInputEl || !runBtn || !resetBtn || !testOutputsEl || !taskButtonsEl || !taskSubtasksEl || !taskTextWrapEl || !taskTextEl || !statusBoxEl || !stepCountEl || !emojiKeyboardEl) {
      throw new Error("LovelaceLabShell: missing required DOM elements");
    }
    if (!useFixedTests && (!addTestBtn || !resetTestsBtn || !testListEl)) {
      throw new Error("LovelaceLabShell: missing test controls");
    }

    const exampleButtons = [
      document.getElementById("example1Btn"),
      document.getElementById("example2Btn"),
      document.getElementById("example3Btn"),
      document.getElementById("example4Btn"),
      document.getElementById("example5Btn")
    ].filter(Boolean);

    const examples = Array.isArray(config.examples) ? config.examples : [];
    const taskButtons = Array.from(taskButtonsEl.querySelectorAll("[data-task]"));
    const taskSubtaskCounts = (config.taskSubtaskCounts && typeof config.taskSubtaskCounts === "object") ? config.taskSubtaskCounts : {};
    const subtaskPresets = (config.subtaskPresets && typeof config.subtaskPresets === "object") ? config.subtaskPresets : {};
    const subtaskTexts = (config.subtaskTexts && typeof config.subtaskTexts === "object") ? config.subtaskTexts : {};
    const keyboardGroups = Array.isArray(config.keyboardGroups) ? config.keyboardGroups : [];
    const lineDigits = Array.isArray(config.lineDigits) && config.lineDigits.length === 10 ? config.lineDigits.slice() : [];
    const testInputPlaceholder = typeof config.testInputPlaceholder === "string" ? config.testInputPlaceholder : "";
    const hardStepLimit = Number.isInteger(config.hardStepLimit) && config.hardStepLimit > 0 ? config.hardStepLimit : DEFAULT_HARD_STEP_LIMIT;
    const yieldEvery = Number.isInteger(config.yieldEvery) && config.yieldEvery > 0 ? config.yieldEvery : DEFAULT_YIELD_EVERY;
    const maxTracePoints = Number.isInteger(config.maxTracePoints) && config.maxTracePoints > 0 ? config.maxTracePoints : 2000;

    let lastFocusedField = codeInputEl;
    let selectedExampleIndex = -1;
    let selectedTaskKey = "";
    let selectedSubtaskKey = "";
    let codeInputResizeObserver = null;
    let currentScenarioKey = "";
    const KONAMI_BUTTON_SEQUENCE = ["up", "up", "down", "down", "left", "right", "left", "right", "2", "1"];
    let konamiButtonBuffer = [];

    function hideCodePhrasePanel() {
      if (!codePhrasePanelEl) return;
      codePhrasePanelEl.hidden = true;
      const codePhraseInputEl = document.getElementById("codePhraseInput");
      if (codePhraseInputEl) codePhraseInputEl.value = "";
    }

    function setStatus(kind, message) {
      statusBoxEl.className = `status-box ${kind}`;
      statusBoxEl.textContent = message;
    }

    function toggleKonamiDarkTheme() {
      const body = document.body;
      if (!body) return false;
      return body.classList.toggle("konami-dark");
    }

    function recordKonamiButtonStep(step) {
      if (!step) return;
      konamiButtonBuffer.push(step);
      if (konamiButtonBuffer.length > KONAMI_BUTTON_SEQUENCE.length) {
        konamiButtonBuffer = konamiButtonBuffer.slice(-KONAMI_BUTTON_SEQUENCE.length);
      }
      if (KONAMI_BUTTON_SEQUENCE.every((item, index) => konamiButtonBuffer[index] === item)) {
        konamiButtonBuffer = [];
        const enabled = toggleKonamiDarkTheme();
        setStatus("ok", enabled ? "Пасхалка: тёмная тема включена." : "Пасхалка: тёмная тема выключена.");
      }
    }

    function getEasterDigitStepFromEmoji(emoji) {
      const src = String(emoji || "").normalize("NFKC");
      const digit = src.replace(/\uFE0F|\u20E3/g, "");
      if (digit.length === 1 && digit >= "0" && digit <= "9") return digit;
      if (lineDigits.length === 10) {
        const idx = lineDigits.indexOf(emoji);
        if (idx >= 0) return String(idx);
      }
      return "";
    }

    function editorLineCount() {
      const source = String(codeInputEl.value || "").replace(/\r\n?/g, "\n");
      return source.split("\n").length;
    }

    function toLineNumberText(value) {
      const safe = Math.max(0, Math.trunc(value));
      if (!lineDigits.length) return String(safe);
      const text = String(safe);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i) - 48;
        if (code >= 0 && code <= 9) out += lineDigits[code];
      }
      return out || lineDigits[0];
    }

    function syncCodeLineNumbersScroll() {
      if (!codeLineNumbersEl) return;
      codeLineNumbersEl.scrollTop = codeInputEl.scrollTop;
    }

    function syncCodeLineNumbersHeight() {
      if (!codeLineNumbersEl) return;
      const nextHeight = codeInputEl.offsetHeight;
      if (nextHeight > 0) codeLineNumbersEl.style.height = `${nextHeight}px`;
    }

    function refreshCodeLineNumbers() {
      if (!codeLineNumbersEl) return;
      const lines = [];
      const total = editorLineCount();
      for (let i = 1; i <= total; i++) lines.push(toLineNumberText(i));
      const content = lines.join("\n");
      if (codeLineNumbersEl.value !== content) codeLineNumbersEl.value = content;
      syncCodeLineNumbersHeight();
      syncCodeLineNumbersScroll();
    }

    function setPressedState(button, isPressed) {
      if (!button) return;
      button.setAttribute("aria-pressed", isPressed ? "true" : "false");
    }

    function syncExampleButtons() {
      for (let i = 0; i < exampleButtons.length; i++) {
        setPressedState(exampleButtons[i], i === selectedExampleIndex);
      }
    }

    function syncTaskButtons() {
      for (const btn of taskButtons) {
        const taskKey = String(btn.dataset.task || "");
        setPressedState(btn, taskKey === selectedTaskKey && selectedTaskKey !== "");
      }
    }

    function syncSubtaskButtons() {
      const subtaskButtons = Array.from(taskSubtasksEl.querySelectorAll("[data-subtask]"));
      for (const btn of subtaskButtons) {
        const key = String(btn.dataset.subtask || "");
        setPressedState(btn, key === selectedSubtaskKey && selectedSubtaskKey !== "");
      }
    }

    function setTaskText(subtaskKey) {
      const raw = subtaskTexts[subtaskKey];
      const lines = Array.isArray(raw)
        ? raw.map((item) => String(item || "").trim()).filter((item) => item.length > 0)
        : [];
      if (!lines.length) {
        taskTextEl.textContent = "";
        taskTextWrapEl.hidden = true;
        return;
      }
      taskTextEl.textContent = "";
      for (const line of lines) {
        const p = document.createElement("p");
        p.textContent = line;
        taskTextEl.appendChild(p);
      }
      taskTextWrapEl.hidden = false;
    }

    function setCurrentScenarioKey(nextKey) {
      currentScenarioKey = String(nextKey || "");
    }

    function resolveFixedTestsForScenario() {
      if (!useFixedTests) return [];
      const list = fixedTestsByScenario[currentScenarioKey] || fixedTestsByScenario["*"];
      if (!Array.isArray(list) || !list.length) return [""];
      return list.map((item) => String(item || ""));
    }

    function currentTestsSnapshot() {
      if (useFixedTests) return resolveFixedTestsForScenario();
      return getTestsFromUi();
    }

    function emitScenarioChange() {
      if (!onScenarioChange) return;
      try {
        onScenarioChange({
          scenarioKey: currentScenarioKey,
          tests: currentTestsSnapshot()
        });
      } catch (_) {}
    }

    function resetResultPanels() {
      hideCodePhrasePanel();
      setStatus("", "Ожидание запуска.");
      stepCountEl.textContent = "Суммарные шаги: 0";
      testOutputsEl.textContent = "";
    }

    function createTestItem(inputText = "") {
      if (!testListEl) return null;
      const wrap = document.createElement("section");
      wrap.className = "test-item";

      const head = document.createElement("div");
      head.className = "test-head";

      const label = document.createElement("div");
      label.className = "test-label";
      label.dataset.testLabel = "1";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "Удалить";
      removeBtn.dataset.testRemove = "1";
      removeBtn.addEventListener("click", () => {
        wrap.remove();
        renumberTests();
        resetResultPanels();
      });

      head.appendChild(label);
      head.appendChild(removeBtn);

      const input = document.createElement("textarea");
      input.className = "stdin-input";
      input.spellcheck = false;
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.dataset.testInput = "1";
      input.placeholder = testInputPlaceholder;
      input.value = String(inputText || "");

      wrap.appendChild(head);
      wrap.appendChild(input);
      return wrap;
    }

    function renumberTests() {
      if (!testListEl) return;
      const tests = Array.from(testListEl.querySelectorAll(".test-item"));
      if (!tests.length) {
        const item = createTestItem("");
        if (item) testListEl.appendChild(item);
        return renumberTests();
      }
      for (let i = 0; i < tests.length; i++) {
        const item = tests[i];
        const label = item.querySelector("[data-test-label]");
        const removeBtn = item.querySelector("[data-test-remove]");
        if (label) label.textContent = `Тест ${i + 1}`;
        if (removeBtn) removeBtn.disabled = tests.length === 1;
      }
    }

    function getTestsFromUi() {
      if (!testListEl) return [""];
      const fields = Array.from(testListEl.querySelectorAll("[data-test-input]"));
      return fields.map((field) => String(field.value || ""));
    }

    function setTestsToUi(inputs) {
      if (!testListEl) return;
      testListEl.textContent = "";
      const list = Array.isArray(inputs) && inputs.length ? inputs : [""];
      for (const text of list) {
        const item = createTestItem(text);
        if (item) testListEl.appendChild(item);
      }
      renumberTests();
    }

    function renderOutputs(results) {
      testOutputsEl.textContent = "";
      const itemLabel = useFixedTests ? "Сценарий" : "Тест";
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const card = document.createElement("section");
        card.className = `test-output-card ${result.kind}`;

        const title = document.createElement("div");
        title.className = "test-label";
        title.textContent = `${itemLabel} ${i + 1}`;

        const meta = document.createElement("div");
        meta.className = "test-output-meta";
        meta.textContent = result.meta;

        const out = document.createElement("textarea");
        out.className = "output-box";
        out.readOnly = true;
        out.value = result.value;

        card.appendChild(title);
        card.appendChild(meta);
        card.appendChild(out);
        testOutputsEl.appendChild(card);
      }
    }

    function applySubtaskPreset(subtaskKey) {
      const preset = subtaskPresets[subtaskKey];
      if (!preset || typeof preset !== "object") return;
      codeInputEl.value = String(preset.code || "");
      refreshCodeLineNumbers();
      if (!useFixedTests) {
        const tests = Array.isArray(preset.tests) && preset.tests.length ? preset.tests : [""];
        setTestsToUi(tests);
      }
      resetResultPanels();
    }

    function selectSubtask(subtaskKey) {
      selectedSubtaskKey = subtaskKey;
      setCurrentScenarioKey(`task:${subtaskKey}`);
      syncSubtaskButtons();
      setTaskText(subtaskKey);
      applySubtaskPreset(subtaskKey);
      emitScenarioChange();
    }

    function clearSubtasks() {
      selectedSubtaskKey = "";
      setCurrentScenarioKey("");
      taskSubtasksEl.textContent = "";
      taskSubtasksEl.hidden = true;
      setTaskText("");
      emitScenarioChange();
    }

    function renderSubtasks(taskKey) {
      taskSubtasksEl.textContent = "";
      const rawCount = taskSubtaskCounts[taskKey];
      const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 4;
      if (count === 1) {
        taskSubtasksEl.hidden = true;
        return;
      }
      for (let i = 1; i <= count; i++) {
        const subtaskKey = `${taskKey}.${i}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.subtask = subtaskKey;
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = `Подзадача ${subtaskKey}`;
        btn.addEventListener("click", () => {
          selectSubtask(subtaskKey);
        });
        taskSubtasksEl.appendChild(btn);
      }
      taskSubtasksEl.hidden = false;
      syncSubtaskButtons();
    }

    function updateFocusTarget(target) {
      if (target === codeInputEl) lastFocusedField = target;
    }

    function resolveInsertTarget() {
      if (lastFocusedField === codeInputEl) return lastFocusedField;
      return codeInputEl;
    }

    function getSelectionRange(target) {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      return { start, end };
    }

    function focusCodeInput() {
      codeInputEl.focus();
      updateFocusTarget(codeInputEl);
      return codeInputEl;
    }

    function insertCodeText(text) {
      const target = focusCodeInput();
      const { start, end } = getSelectionRange(target);
      target.setRangeText(text, start, end, "end");
      updateFocusTarget(target);
      refreshCodeLineNumbers();
    }

    function insertEmoji(emoji) {
      const target = resolveInsertTarget();
      target.focus();
      const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : target.value.length;
      target.setRangeText(emoji, start, end, "end");
      updateFocusTarget(target);
      refreshCodeLineNumbers();
    }

    function moveCaretHorizontal(delta) {
      const target = focusCodeInput();
      const text = target.value;
      const { start, end } = getSelectionRange(target);
      let next = start;
      if (delta < 0) {
        if (start !== end) next = boundaryAtOrBefore(text, Math.min(start, end));
        else next = previousBoundary(text, start);
      } else {
        if (start !== end) next = boundaryAtOrAfter(text, Math.max(start, end));
        else next = nextBoundary(text, end);
      }
      target.setSelectionRange(next, next);
      updateFocusTarget(target);
    }

    function moveCaretVertical(delta) {
      const target = focusCodeInput();
      const text = target.value;
      const { start, end } = getSelectionRange(target);
      const base = delta < 0 ? Math.min(start, end) : Math.max(start, end);
      const currStart = findLineStart(text, base);
      const currEnd = findLineEnd(text, base);
      const currLine = text.slice(currStart, currEnd);
      const currRel = Math.max(0, Math.min(currLine.length, base - currStart));
      const currCol = graphemeIndexAtPosition(currLine, currRel);
      let next = base;

      if (delta < 0) {
        if (currStart === 0) {
          next = 0;
        } else {
          const prevEnd = currStart - 1;
          const prevStart = findLineStart(text, prevEnd);
          const prevLine = text.slice(prevStart, prevEnd);
          const prevRel = positionAtGraphemeIndex(prevLine, currCol);
          next = prevStart + prevRel;
        }
      } else {
        if (currEnd >= text.length) {
          next = text.length;
        } else {
          const nextStart = currEnd + 1;
          const nextEnd = findLineEnd(text, nextStart);
          const nextLine = text.slice(nextStart, nextEnd);
          const nextRel = positionAtGraphemeIndex(nextLine, currCol);
          next = nextStart + nextRel;
        }
      }

      target.setSelectionRange(next, next);
      updateFocusTarget(target);
    }

    function backspaceInCodeInput() {
      const target = focusCodeInput();
      const text = target.value;
      const { start, end } = getSelectionRange(target);
      if (start !== end) {
        const delStart = boundaryAtOrBefore(text, Math.min(start, end));
        const delEnd = boundaryAtOrAfter(text, Math.max(start, end));
        target.setRangeText("", delStart, delEnd, "end");
      } else if (start > 0) {
        const range = graphemeRangeContaining(text, start - 1);
        target.setRangeText("", range.start, range.end, "end");
      }
      updateFocusTarget(target);
      refreshCodeLineNumbers();
    }

    function deleteInCodeInput() {
      const target = focusCodeInput();
      const text = target.value;
      const { start, end } = getSelectionRange(target);
      if (start !== end) {
        const delStart = boundaryAtOrBefore(text, Math.min(start, end));
        const delEnd = boundaryAtOrAfter(text, Math.max(start, end));
        target.setRangeText("", delStart, delEnd, "end");
      } else if (start < text.length) {
        const range = graphemeRangeContaining(text, start);
        target.setRangeText("", range.start, range.end, "end");
      }
      updateFocusTarget(target);
      refreshCodeLineNumbers();
    }

    function createNavButton(text, title, className, onClick, easterStep = "") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `nav-btn ${className}`;
      btn.textContent = text;
      btn.title = title;
      btn.addEventListener("mousedown", (event) => event.preventDefault());
      btn.addEventListener("click", () => {
        if (easterStep) recordKonamiButtonStep(easterStep);
        onClick();
      });
      return btn;
    }

    function renderKeyboard() {
      emojiKeyboardEl.textContent = "";
      const layoutEl = document.createElement("div");
      layoutEl.className = "keyboard-layout";

      const leftEl = document.createElement("div");
      leftEl.className = "keyboard-left";

      for (let i = 0; i < keyboardGroups.length; i++) {
        const group = keyboardGroups[i];
        const groupEl = document.createElement("section");
        groupEl.className = `emoji-group group-${i + 1}`;

        const gridEl = document.createElement("div");
        gridEl.className = "emoji-grid";

        for (let j = 0; j < group.length; j++) {
          const emoji = group[j];
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "emoji-btn";
          btn.textContent = emoji;
          btn.title = `Вставить ${emoji}`;
          btn.addEventListener("mousedown", (event) => event.preventDefault());
          btn.addEventListener("click", () => {
            const digitStep = getEasterDigitStepFromEmoji(emoji);
            if (digitStep) recordKonamiButtonStep(digitStep);
            insertEmoji(emoji);
          });
          gridEl.appendChild(btn);
        }

        groupEl.appendChild(gridEl);
        leftEl.appendChild(groupEl);
      }

      const navEl = document.createElement("section");
      navEl.className = "editor-nav";

      const navTitleEl = document.createElement("p");
      navTitleEl.className = "nav-title";
      navTitleEl.textContent = "Навигация";

      const arrowsEl = document.createElement("div");
      arrowsEl.className = "nav-arrows";
      arrowsEl.appendChild(createNavButton("↑", "Строка выше", "up", () => moveCaretVertical(-1), "up"));
      arrowsEl.appendChild(createNavButton("←", "Графема слева", "left", () => moveCaretHorizontal(-1), "left"));
      arrowsEl.appendChild(createNavButton("↓", "Строка ниже", "down", () => moveCaretVertical(1), "down"));
      arrowsEl.appendChild(createNavButton("→", "Графема справа", "right", () => moveCaretHorizontal(1), "right"));

      const actionsEl = document.createElement("div");
      actionsEl.className = "nav-actions";
      actionsEl.appendChild(createNavButton("Enter", "Вставить перенос", "enter", () => insertCodeText("\n")));
      actionsEl.appendChild(createNavButton("Backspace", "Удалить слева", "backspace", backspaceInCodeInput));
      actionsEl.appendChild(createNavButton("Delete", "Удалить справа", "delete", deleteInCodeInput));

      navEl.appendChild(navTitleEl);
      navEl.appendChild(arrowsEl);
      navEl.appendChild(actionsEl);

      layoutEl.appendChild(leftEl);
      layoutEl.appendChild(navEl);
      emojiKeyboardEl.appendChild(layoutEl);
    }

    async function handleRun() {
      runBtn.disabled = true;
      hideCodePhrasePanel();
      setStatus("", "Парсинг программы...");
      stepCountEl.textContent = "Суммарные шаги: 0";

      const tests = useFixedTests ? resolveFixedTestsForScenario() : getTestsFromUi();
      const hasAtLeastOneTest = tests.length > 0;
      if (!hasAtLeastOneTest && !useFixedTests) setTestsToUi([""]);
      const safeTests = hasAtLeastOneTest ? tests : [""];

      let parsedProgram = null;
      try {
        parsedProgram = domain.parseProgram(codeInputEl.value, {
          normalizeCodeLine,
          splitGraphemes,
          makeError
        });
      } catch (err) {
        const msg = formatLineOnlyError(err);
        const failResults = safeTests.map(() => ({ kind: "error", meta: "Ошибка", value: msg }));
        renderOutputs(failResults);
        setStatus("error", msg);
        runBtn.disabled = false;
        return;
      }

      setStatus("", `Инструкций: ${Array.isArray(parsedProgram) ? parsedProgram.length : 0}. Выполнение тестов...`);

      const results = [];
      const domainResults = [];
      let totalSteps = 0;
      let okCount = 0;
      let warnCount = 0;
      let errCount = 0;

      for (let i = 0; i < safeTests.length; i++) {
        try {
          const domainResult = await domain.executeProgram(parsedProgram, safeTests[i], {
            hardStepLimit,
            yieldEvery,
            maxTracePoints,
            splitGraphemes,
            makeError
          });
          domainResults.push(domainResult);
          const steps = Number.isInteger(domainResult && domainResult.steps) ? domainResult.steps : 0;
          totalSteps += steps;
          const status = domainResult && typeof domainResult.status === "string" ? domainResult.status : "ok";
          const output = domainResult && typeof domainResult.output === "string" ? domainResult.output : "";

          if (status === "ok") {
            okCount += 1;
            results.push({ kind: "ok", meta: `Успех. Шаги: ${steps}`, value: output });
          } else if (status === "warn" || status === "limit") {
            warnCount += 1;
            results.push({ kind: "warn", meta: `Проверка. Шаги: ${steps}`, value: output });
          } else {
            errCount += 1;
            results.push({ kind: "error", meta: "Ошибка", value: output || "Ошибка." });
          }
        } catch (err) {
          domainResults.push(null);
          errCount += 1;
          const msg = formatLineOnlyError(err);
          results.push({ kind: "error", meta: "Ошибка", value: msg });
        }
      }

      renderOutputs(results);
      stepCountEl.textContent = `Суммарные шаги: ${totalSteps}`;
      const noun = useFixedTests ? "сценарий(ев)" : "тест(а/ов)";
      if (errCount > 0) {
        setStatus("error", `Готово: успех ${okCount}, предупреждения ${warnCount}, ошибки ${errCount}.`);
      } else if (warnCount > 0) {
        setStatus("warn", `Готово: успех ${okCount}, предупреждения ${warnCount}.`);
      } else {
        setStatus("ok", `Готово: все ${okCount} ${noun} выполнены успешно.`);
      }

      if (onRunComplete) {
        try {
          onRunComplete({
            scenarioKey: currentScenarioKey,
            tests: safeTests.slice(),
            outputResults: results.slice(),
            domainResults: domainResults.slice()
          });
        } catch (_) {}
      }

      runBtn.disabled = false;
    }

    function applyExample(index) {
      const item = examples[index];
      if (!item) return;
      selectedExampleIndex = index;
      selectedTaskKey = "";
      selectedSubtaskKey = "";
      syncExampleButtons();
      syncTaskButtons();
      clearSubtasks();
      setCurrentScenarioKey(`example:${index + 1}`);
      codeInputEl.value = String(item.code || "");
      refreshCodeLineNumbers();
      if (!useFixedTests) {
        setTestsToUi(Array.isArray(item.tests) && item.tests.length ? item.tests : [""]);
      }
      codeInputEl.focus();
      updateFocusTarget(codeInputEl);
      resetResultPanels();
      emitScenarioChange();
    }

    function initExamples() {
      for (let i = 0; i < exampleButtons.length; i++) {
        const btn = exampleButtons[i];
        const item = examples[i];
        if (!item) {
          btn.hidden = true;
          continue;
        }
        btn.hidden = false;
        btn.textContent = item.label ? String(item.label) : `Пример №${i + 1}`;
        btn.addEventListener("click", () => applyExample(i));
      }
    }

    function initTasks() {
      syncExampleButtons();
      syncTaskButtons();
      clearSubtasks();
      for (const btn of taskButtons) {
        btn.addEventListener("click", () => {
          const taskKey = String(btn.dataset.task || "");
          if (!taskKey) return;
          selectedExampleIndex = -1;
          selectedTaskKey = taskKey;
          selectedSubtaskKey = "";
          syncExampleButtons();
          syncTaskButtons();
          renderSubtasks(taskKey);
          selectSubtask(`${taskKey}.1`);
        });
      }
    }

    for (const el of [codeInputEl]) {
      el.addEventListener("focus", () => updateFocusTarget(el));
      el.addEventListener("click", () => updateFocusTarget(el));
      el.addEventListener("keyup", () => updateFocusTarget(el));
    }

    codeInputEl.addEventListener("input", refreshCodeLineNumbers);
    codeInputEl.addEventListener("scroll", syncCodeLineNumbersScroll);

    if (typeof ResizeObserver === "function") {
      codeInputResizeObserver = new ResizeObserver(() => syncCodeLineNumbersHeight());
      codeInputResizeObserver.observe(codeInputEl);
    } else {
      window.addEventListener("resize", syncCodeLineNumbersHeight);
    }

    runBtn.addEventListener("click", () => {
      handleRun();
    });

    resetBtn.addEventListener("click", resetResultPanels);

    if (useFixedTests) {
      if (testsPanelEl) testsPanelEl.hidden = true;
    } else {
      addTestBtn.addEventListener("click", () => {
        if (!testListEl) return;
        const item = createTestItem("");
        if (item) testListEl.appendChild(item);
        renumberTests();
        resetResultPanels();
      });

      resetTestsBtn.addEventListener("click", () => {
        setTestsToUi([""]);
        resetResultPanels();
      });
    }

    renderKeyboard();
    initExamples();
    initTasks();
    if (examples.length > 0) applyExample(0);
    else if (!useFixedTests) setTestsToUi([""]);
    resetResultPanels();
    refreshCodeLineNumbers();
    codeInputEl.focus();
    updateFocusTarget(codeInputEl);
  }

  window.LovelaceLabShell = { boot };
})();
