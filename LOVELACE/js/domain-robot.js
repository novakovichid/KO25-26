(function () {
  const KEYCAP_DIGITS = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

  function norm(token) {
    return String(token || "").replace(/\uFE0F/g, "");
  }

  const DIR_BY_TOKEN = new Map([
    [norm("✈️"), { dx: 0, dy: -1, name: "up" }],
    [norm("🚇"), { dx: 0, dy: 1, name: "down" }],
    [norm("🚠"), { dx: 1, dy: 0, name: "right" }],
    [norm("🚜"), { dx: -1, dy: 0, name: "left" }]
  ]);

  const COLOR_TOKEN_TO_CODE = new Map([
    [norm("🌹"), "red"],
    [norm("🌻"), "yellow"],
    [norm("🍀"), "green"],
    [norm("🍇"), "purple"]
  ]);

  const COLOR_CODE_TO_TOKEN = {
    red: "🌹",
    yellow: "🌻",
    green: "🍀",
    purple: "🍇"
  };

  const CMP_TOKEN = {
    eq: norm("🟰"),
    ne: norm("🚫"),
    gt: norm("🔥"),
    lt: norm("🧊")
  };

  const KEYCAP_TO_VALUE = (() => {
    const map = new Map();
    for (let i = 0; i < KEYCAP_DIGITS.length; i++) {
      const raw = KEYCAP_DIGITS[i];
      map.set(raw, String(i));
      map.set(norm(raw), String(i));
    }
    return map;
  })();

  function parseDirection(token, line, makeError) {
    const dir = DIR_BY_TOKEN.get(norm(token));
    if (!dir) throw makeError("parse", line, "Ожидалось направление.");
    return dir;
  }

  function parseColorToken(token, line, makeError) {
    const color = COLOR_TOKEN_TO_CODE.get(norm(token));
    if (!color) throw makeError("parse", line, "Ожидался цвет клетки.");
    return color;
  }

  function parseKeycapNumber(tokens, line, makeError) {
    if (!tokens.length) throw makeError("parse", line, "Ожидалось число в keycap-цифрах.");
    let text = "";
    for (const token of tokens) {
      const val = KEYCAP_TO_VALUE.get(token) || KEYCAP_TO_VALUE.get(norm(token));
      if (typeof val !== "string") throw makeError("parse", line, "Ожидалось число в keycap-цифрах.");
      text += val;
    }
    const value = Number(text);
    if (!Number.isFinite(value)) throw makeError("parse", line, "Ожидалось число в keycap-цифрах.");
    return Math.trunc(value);
  }

  function parseTempPredicate(tokens, line, makeError) {
    if (tokens.length < 2) throw makeError("parse", line, "Команда 🌡 задана некорректно.");
    let cmp = "";
    let idx = 1;
    const t1 = norm(tokens[1]);
    const t2 = tokens.length > 2 ? norm(tokens[2]) : "";

    if (t1 === CMP_TOKEN.gt && t2 === CMP_TOKEN.eq) {
      cmp = "ge";
      idx = 3;
    } else if (t1 === CMP_TOKEN.lt && t2 === CMP_TOKEN.eq) {
      cmp = "le";
      idx = 3;
    } else if (t1 === CMP_TOKEN.eq) {
      cmp = "eq";
      idx = 2;
    } else if (t1 === CMP_TOKEN.ne) {
      cmp = "ne";
      idx = 2;
    } else if (t1 === CMP_TOKEN.gt) {
      cmp = "gt";
      idx = 2;
    } else if (t1 === CMP_TOKEN.lt) {
      cmp = "lt";
      idx = 2;
    } else {
      throw makeError("parse", line, "Команда 🌡 задана некорректно.");
    }

    const value = parseKeycapNumber(tokens.slice(idx), line, makeError);
    return { type: "temp", cmp, value };
  }

  function parsePredicate(tokens, line, makeError) {
    if (!tokens.length) throw makeError("parse", line, "Ожидалось условие.");
    const op = norm(tokens[0]);

    if (op === norm("🧱")) {
      if (tokens.length !== 2) throw makeError("parse", line, "Проверка 🧱 задана некорректно.");
      return { type: "wall", dir: parseDirection(tokens[1], line, makeError) };
    }

    if (op === norm("🛤")) {
      if (tokens.length !== 2) throw makeError("parse", line, "Проверка 🛤 задана некорректно.");
      return { type: "free", dir: parseDirection(tokens[1], line, makeError) };
    }

    if (op === norm("🏁")) {
      if (tokens.length !== 1) throw makeError("parse", line, "Проверка 🏁 задана некорректно.");
      return { type: "finish" };
    }

    if (op === norm("🎯")) {
      if (tokens.length !== 2) throw makeError("parse", line, "Проверка 🎯 задана некорректно.");
      return { type: "color", color: parseColorToken(tokens[1], line, makeError) };
    }

    if (op === norm("🌡")) {
      return parseTempPredicate(tokens, line, makeError);
    }

    throw makeError("parse", line, "Неизвестное условие.");
  }

  function parseProgram(source, tools) {
    const splitGraphemes = tools.splitGraphemes;
    const makeError = tools.makeError;
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const instructions = [];
    const blockStack = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNo = idx + 1;
      const compactLine = String(lines[idx] || "").replace(/\s+/g, "");
      if (!compactLine) continue;

      const tokensRaw = splitGraphemes(compactLine);
      const tokens = tokensRaw.map((item) => norm(item)).filter((item) => item.length > 0);
      if (!tokens.length) continue;
      const op = tokens[0];

      if (op === norm("🚶")) {
        if (tokens.length !== 2) throw makeError("parse", lineNo, "Команда 🚶 требует одно направление.");
        instructions.push({ type: "move", dir: parseDirection(tokens[1], lineNo, makeError), line: lineNo });
        continue;
      }

      if (op === norm("🎨")) {
        if (tokens.length !== 2) throw makeError("parse", lineNo, "Команда 🎨 требует один цвет.");
        instructions.push({ type: "paint", color: parseColorToken(tokens[1], lineNo, makeError), line: lineNo });
        continue;
      }

      if (op === norm("🤔")) {
        const pred = parsePredicate(tokens.slice(1), lineNo, makeError);
        instructions.push({ type: "if", pred, jumpTo: -1, line: lineNo });
        blockStack.push({ type: "if", index: instructions.length - 1 });
        continue;
      }

      if (op === norm("🔁")) {
        const pred = parsePredicate(tokens.slice(1), lineNo, makeError);
        instructions.push({ type: "while", pred, jumpTo: -1, line: lineNo });
        blockStack.push({ type: "while", index: instructions.length - 1 });
        continue;
      }

      if (op === norm("🔂")) {
        const count = parseKeycapNumber(tokens.slice(1), lineNo, makeError);
        instructions.push({ type: "loopCount", count, jumpTo: -1, line: lineNo });
        blockStack.push({ type: "loopCount", index: instructions.length - 1 });
        continue;
      }

      if (op === norm("😐")) {
        if (tokens.length !== 1) throw makeError("parse", lineNo, "Команда 😐 не принимает аргументы.");
        if (!blockStack.length) throw makeError("parse", lineNo, "Лишний 😐 без открывающего блока.");
        const block = blockStack.pop();
        if (block.type === "if") instructions.push({ type: "ifEnd", ifIndex: block.index, line: lineNo });
        else if (block.type === "loopCount") instructions.push({ type: "loopCountEnd", loopIndex: block.index, line: lineNo });
        else instructions.push({ type: "whileEnd", loopIndex: block.index, line: lineNo });
        const endIndex = instructions.length - 1;
        instructions[block.index].jumpTo = endIndex + 1;
        continue;
      }

      throw makeError("parse", lineNo, "Неизвестная команда.");
    }

    if (blockStack.length) {
      const block = blockStack[0];
      const ins = instructions[block.index];
      throw makeError("parse", ins.line, "Блок не закрыт командой 😐.");
    }

    return instructions;
  }

  function keyOf(x, y) {
    return `${x}:${y}`;
  }

  function asNonNegativeInt(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    const n = Math.trunc(num);
    if (n < 0) return fallback;
    return n;
  }

  function parseCoordPair(value, fallback) {
    if (!Array.isArray(value) || value.length !== 2) return fallback.slice();
    return [asNonNegativeInt(value[0], fallback[0]), asNonNegativeInt(value[1], fallback[1])];
  }

  function parseScenario(inputText) {
    let raw = {};
    try {
      raw = JSON.parse(String(inputText || "{}"));
    } catch (_) {
      return { ok: false, error: "Некорректный JSON сценария." };
    }

    const sizeRaw = parseCoordPair(raw.size, [5, 5]);
    const width = Math.max(1, sizeRaw[0]);
    const height = Math.max(1, sizeRaw[1]);

    const start = parseCoordPair(raw.start, [0, 0]);
    const finish = parseCoordPair(raw.finish, [width - 1, height - 1]);

    function clampPos(pos) {
      return [Math.max(0, Math.min(width - 1, pos[0])), Math.max(0, Math.min(height - 1, pos[1]))];
    }

    const safeStart = clampPos(start);
    const safeFinish = clampPos(finish);

    const blocked = new Set();
    if (Array.isArray(raw.blocked)) {
      for (const item of raw.blocked) {
        const [x, y] = parseCoordPair(item, [-1, -1]);
        if (x >= 0 && x < width && y >= 0 && y < height) blocked.add(keyOf(x, y));
      }
    }

    const cells = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) row.push({ color: null, temp: 0 });
      cells.push(row);
    }

    function parseColorValue(value) {
      if (typeof value !== "string") return null;
      const token = norm(value.trim());
      if (!token) return null;
      if (COLOR_TOKEN_TO_CODE.has(token)) return COLOR_TOKEN_TO_CODE.get(token);
      if (token === "red" || token === "красный") return "red";
      if (token === "yellow" || token === "желтый" || token === "жёлтый") return "yellow";
      if (token === "green" || token === "зеленый" || token === "зелёный") return "green";
      if (token === "purple" || token === "фиолетовый") return "purple";
      return null;
    }

    if (Array.isArray(raw.cells)) {
      for (const item of raw.cells) {
        if (!item || typeof item !== "object") continue;
        const x = asNonNegativeInt(item.x, -1);
        const y = asNonNegativeInt(item.y, -1);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const temp = Number(item.temp);
        if (Number.isFinite(temp)) cells[y][x].temp = Math.trunc(temp);
        const color = parseColorValue(item.color);
        if (color) cells[y][x].color = color;
      }
    }

    return {
      ok: true,
      scenario: {
        width,
        height,
        start: safeStart,
        finish: safeFinish,
        blocked,
        cells,
        expect: (raw.expect && typeof raw.expect === "object") ? raw.expect : null
      }
    };
  }

  function isBlockedOrOutside(state, x, y) {
    if (x < 0 || x >= state.width || y < 0 || y >= state.height) return true;
    return state.blocked.has(keyOf(x, y));
  }

  function compareTemp(actual, cmp, expected) {
    if (cmp === "eq") return actual === expected;
    if (cmp === "ne") return actual !== expected;
    if (cmp === "gt") return actual > expected;
    if (cmp === "lt") return actual < expected;
    if (cmp === "ge") return actual >= expected;
    if (cmp === "le") return actual <= expected;
    return false;
  }

  function evalPredicate(state, pred) {
    if (pred.type === "wall") {
      const nx = state.x + pred.dir.dx;
      const ny = state.y + pred.dir.dy;
      return isBlockedOrOutside(state, nx, ny);
    }

    if (pred.type === "free") {
      const nx = state.x + pred.dir.dx;
      const ny = state.y + pred.dir.dy;
      return !isBlockedOrOutside(state, nx, ny);
    }

    if (pred.type === "finish") {
      return state.x === state.finish[0] && state.y === state.finish[1];
    }

    if (pred.type === "color") {
      return state.cells[state.y][state.x].color === pred.color;
    }

    if (pred.type === "temp") {
      return compareTemp(state.cells[state.y][state.x].temp, pred.cmp, pred.value);
    }

    return false;
  }

  function buildOutput(state, check) {
    const colorCode = state.cells[state.y][state.x].color;
    const colorToken = colorCode ? (COLOR_CODE_TO_TOKEN[colorCode] || colorCode) : "пусто";
    const finishReached = state.x === state.finish[0] && state.y === state.finish[1];
    const lines = [
      `Позиция: [${state.x}, ${state.y}]`,
      `Финиш достигнут: ${finishReached ? "да" : "нет"}`,
      `Цвет клетки: ${colorToken}`,
      `Температура клетки: ${state.cells[state.y][state.x].temp}`
    ];

    if (check && !check.ok) {
      lines.push(`Проверка: не совпало (${check.issues[0] || "детали"}).`);
    }

    return lines.join("\n");
  }

  function evaluateExpect(state, expect) {
    if (!expect || typeof expect !== "object") return { ok: true, issues: [] };
    const issues = [];

    function parseExpectedColor(value) {
      if (typeof value !== "string") return null;
      const token = norm(value);
      if (COLOR_TOKEN_TO_CODE.has(token)) return COLOR_TOKEN_TO_CODE.get(token);
      if (token === "red" || token === "красный") return "red";
      if (token === "yellow" || token === "желтый" || token === "жёлтый") return "yellow";
      if (token === "green" || token === "зеленый" || token === "зелёный") return "green";
      if (token === "purple" || token === "фиолетовый") return "purple";
      return null;
    }

    const finishReached = state.x === state.finish[0] && state.y === state.finish[1];

    if (typeof expect.finishReached === "boolean" && expect.finishReached !== finishReached) {
      issues.push("finishReached");
    }

    if (Array.isArray(expect.position) && expect.position.length === 2) {
      const ex = asNonNegativeInt(expect.position[0], -1);
      const ey = asNonNegativeInt(expect.position[1], -1);
      if (state.x !== ex || state.y !== ey) issues.push("position");
    }

    if (typeof expect.currentTemp !== "undefined") {
      const expectedTemp = Number(expect.currentTemp);
      if (Number.isFinite(expectedTemp)) {
        if (state.cells[state.y][state.x].temp !== Math.trunc(expectedTemp)) issues.push("currentTemp");
      }
    }

    if (typeof expect.currentColor === "string") {
      const color = parseExpectedColor(expect.currentColor);
      if (color && state.cells[state.y][state.x].color !== color) issues.push("currentColor");
    }

    if (typeof expect.finishColor === "string") {
      const color = parseExpectedColor(expect.finishColor);
      if (color) {
        const finishCell = state.cells[state.finish[1]][state.finish[0]];
        if (finishCell.color !== color) issues.push("finishColor");
      }
    }

    if (typeof expect.finishTemp !== "undefined") {
      const expectedTemp = Number(expect.finishTemp);
      if (Number.isFinite(expectedTemp)) {
        const finishCell = state.cells[state.finish[1]][state.finish[0]];
        if (finishCell.temp !== Math.trunc(expectedTemp)) issues.push("finishTemp");
      }
    }

    if (Array.isArray(expect.cells)) {
      for (const item of expect.cells) {
        if (!item || typeof item !== "object") continue;
        const x = asNonNegativeInt(item.x, -1);
        const y = asNonNegativeInt(item.y, -1);
        if (x < 0 || x >= state.width || y < 0 || y >= state.height) {
          issues.push("cells.outOfRange");
          continue;
        }
        const cell = state.cells[y][x];
        if (typeof item.temp !== "undefined") {
          const expectedTemp = Number(item.temp);
          if (Number.isFinite(expectedTemp) && cell.temp !== Math.trunc(expectedTemp)) issues.push(`cells.temp[${x},${y}]`);
        }
        if (typeof item.color === "string") {
          const color = parseExpectedColor(item.color);
          if (color && cell.color !== color) issues.push(`cells.color[${x},${y}]`);
        }
      }
    }

    return { ok: issues.length === 0, issues };
  }

  async function executeProgram(instructions, testInput, runtimeCtx) {
    const makeError = runtimeCtx.makeError;
    const parsed = parseScenario(testInput);
    if (!parsed.ok) {
      return {
        status: "error",
        steps: 0,
        output: parsed.error
      };
    }

    const scenario = parsed.scenario;
    const state = {
      width: scenario.width,
      height: scenario.height,
      x: scenario.start[0],
      y: scenario.start[1],
      finish: scenario.finish,
      blocked: scenario.blocked,
      cells: scenario.cells
    };

    const hardStepLimit = Number.isInteger(runtimeCtx.hardStepLimit) ? runtimeCtx.hardStepLimit : 200000;
    const yieldEvery = Number.isInteger(runtimeCtx.yieldEvery) ? runtimeCtx.yieldEvery : 1500;

    const loopCountState = new Map();
    let steps = 0;
    let pc = 0;

    while (pc < instructions.length) {
      if (steps >= hardStepLimit) {
        return {
          status: "limit",
          steps,
          output: buildOutput(state, { ok: false, issues: ["limit"] })
        };
      }

      const ins = instructions[pc];
      steps += 1;

      if (ins.type === "move") {
        const nx = state.x + ins.dir.dx;
        const ny = state.y + ins.dir.dy;
        if (isBlockedOrOutside(state, nx, ny)) throw makeError("runtime", ins.line, "Недопустимый шаг.");
        state.x = nx;
        state.y = ny;
        pc += 1;
      } else if (ins.type === "paint") {
        state.cells[state.y][state.x].color = ins.color;
        pc += 1;
      } else if (ins.type === "if") {
        if (evalPredicate(state, ins.pred)) pc += 1;
        else pc = ins.jumpTo;
      } else if (ins.type === "while") {
        if (evalPredicate(state, ins.pred)) pc += 1;
        else pc = ins.jumpTo;
      } else if (ins.type === "loopCount") {
        if (!loopCountState.has(pc)) loopCountState.set(pc, ins.count);
        const remaining = loopCountState.get(pc);
        if (remaining > 0) {
          loopCountState.set(pc, remaining - 1);
          pc += 1;
        } else {
          loopCountState.delete(pc);
          pc = ins.jumpTo;
        }
      } else if (ins.type === "ifEnd") {
        pc += 1;
      } else if (ins.type === "whileEnd") {
        pc = ins.loopIndex;
      } else if (ins.type === "loopCountEnd") {
        pc = ins.loopIndex;
      } else {
        throw makeError("runtime", ins.line, "Неизвестная команда.");
      }

      if (steps % yieldEvery === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const check = evaluateExpect(state, scenario.expect);
    return {
      status: check.ok ? "ok" : "warn",
      steps,
      output: buildOutput(state, check)
    };
  }

  function createRobotDomain() {
    return {
      parseProgram,
      executeProgram,
      digits: KEYCAP_DIGITS.slice()
    };
  }

  window.LovelaceDomains = window.LovelaceDomains || {};
  window.LovelaceDomains.createRobotDomain = createRobotDomain;
})();
