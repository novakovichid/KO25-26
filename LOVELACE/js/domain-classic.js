(function () {
  const VARIABLE_EMOJIS = [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮",
    "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛",
    "🚨"
  ];

  const DIGIT_EMOJIS = ["🆚", "📌", "✌", "🤟", "🤞", "🖐", "🤘", "👌", "👍", "👊"];
  const DIGIT_TO_VALUE = new Map(DIGIT_EMOJIS.map((emoji, idx) => [emoji, String(idx)]));
  const VARIABLE_SET = new Set(VARIABLE_EMOJIS);

  function makeLocalError(makeError, kind, line, message) {
    return makeError(kind, line, message);
  }

  function normalizeCodeLine(line) {
    return String(line || "").replace(/\uFE0F/g, "").replace(/\s+/g, "");
  }

  function requireVariable(symbol, line, makeError) {
    if (!VARIABLE_SET.has(symbol)) {
      throw makeLocalError(makeError, "parse", line, `Ожидалась переменная, получено: ${symbol || "пусто"}.`);
    }
    return symbol;
  }

  function parseEmojiNumber(emojis, line, makeError) {
    if (!emojis.length) {
      throw makeLocalError(makeError, "parse", line, "Команда 🌞 требует хотя бы одну emoji-цифру.");
    }
    let valueText = "";
    for (let i = 0; i < emojis.length; i++) {
      const value = DIGIT_TO_VALUE.get(emojis[i]);
      if (typeof value !== "string") {
        throw makeLocalError(makeError, "parse", line, `Неизвестная emoji-цифра: ${emojis[i]}.`);
      }
      valueText += value;
    }
    const numeric = Number(valueText);
    if (!Number.isFinite(numeric)) {
      throw makeLocalError(makeError, "parse", line, `Число не удалось распознать: ${valueText}.`);
    }
    return Math.trunc(numeric);
  }

  function parseProgram(source, tools) {
    const makeError = tools.makeError;
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const instructions = [];
    const blockStack = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const lineNo = idx + 1;
      const compactLine = normalizeCodeLine(lines[idx]);
      if (!compactLine) continue;

      const tokens = Array.from(compactLine);
      const op = tokens[0];

      if (op === "🌞") {
        if (tokens.length < 3) {
          throw makeLocalError(makeError, "parse", lineNo, "Команда 🌞 требует формат: 🌞<переменная><emoji-число>.");
        }
        const target = requireVariable(tokens[1], lineNo, makeError);
        const value = parseEmojiNumber(tokens.slice(2), lineNo, makeError);
        instructions.push({ type: "set", target, value, line: lineNo });
        continue;
      }

      if (op === "⭐") {
        if (tokens.length !== 2) throw makeLocalError(makeError, "parse", lineNo, "Команда ⭐ требует формат: ⭐<переменная>.");
        instructions.push({ type: "readNumber", target: requireVariable(tokens[1], lineNo, makeError), line: lineNo });
        continue;
      }

      if (op === "🎲") {
        if (tokens.length !== 4) throw makeLocalError(makeError, "parse", lineNo, "Команда 🎲 требует формат: 🎲<переменная><lowVar><highVar>.");
        instructions.push({
          type: "random",
          target: requireVariable(tokens[1], lineNo, makeError),
          low: requireVariable(tokens[2], lineNo, makeError),
          high: requireVariable(tokens[3], lineNo, makeError),
          line: lineNo
        });
        continue;
      }

      if (op === "😀") {
        if (tokens.length !== 2) throw makeLocalError(makeError, "parse", lineNo, "Команда 😀 требует формат: 😀<переменная>.");
        instructions.push({ type: "printNumber", target: requireVariable(tokens[1], lineNo, makeError), line: lineNo });
        continue;
      }

      if (op === "➕" || op === "➖" || op === "✖" || op === "➗" || op === "➰") {
        if (tokens.length !== 3) {
          throw makeLocalError(makeError, "parse", lineNo, `Команда ${op} требует формат: ${op}<переменная><переменная>.`);
        }
        instructions.push({
          type: "math",
          op,
          left: requireVariable(tokens[1], lineNo, makeError),
          right: requireVariable(tokens[2], lineNo, makeError),
          line: lineNo
        });
        continue;
      }

      if (op === "🤔") {
        if (tokens.length !== 3) throw makeLocalError(makeError, "parse", lineNo, "Команда 🤔 требует формат: 🤔<переменная><переменная>.");
        instructions.push({
          type: "ifEq",
          left: requireVariable(tokens[1], lineNo, makeError),
          right: requireVariable(tokens[2], lineNo, makeError),
          jumpTo: -1,
          line: lineNo
        });
        blockStack.push({ type: "if", index: instructions.length - 1 });
        continue;
      }

      if (op === "🔂") {
        if (tokens.length !== 2) throw makeLocalError(makeError, "parse", lineNo, "Команда 🔂 требует формат: 🔂<переменная>.");
        instructions.push({
          type: "loopCount",
          count: requireVariable(tokens[1], lineNo, makeError),
          jumpTo: -1,
          line: lineNo
        });
        blockStack.push({ type: "loopCount", index: instructions.length - 1 });
        continue;
      }

      if (op === "🔁") {
        if (tokens.length !== 3) throw makeLocalError(makeError, "parse", lineNo, "Команда 🔁 требует формат: 🔁<переменная><переменная>.");
        instructions.push({
          type: "loopNeq",
          left: requireVariable(tokens[1], lineNo, makeError),
          right: requireVariable(tokens[2], lineNo, makeError),
          jumpTo: -1,
          line: lineNo
        });
        blockStack.push({ type: "loopNeq", index: instructions.length - 1 });
        continue;
      }

      if (op === "😐") {
        if (tokens.length !== 1) throw makeLocalError(makeError, "parse", lineNo, "Команда 😐 не принимает аргументы.");
        if (!blockStack.length) throw makeLocalError(makeError, "parse", lineNo, "Лишний 😐 без открывающего 🤔, 🔂 или 🔁.");
        const block = blockStack.pop();
        if (block.type === "if") {
          instructions.push({ type: "ifEnd", ifIndex: block.index, line: lineNo });
        } else if (block.type === "loopCount") {
          instructions.push({ type: "loopCountEnd", loopIndex: block.index, line: lineNo });
        } else {
          instructions.push({ type: "loopEnd", loopIndex: block.index, line: lineNo });
        }
        const endIndex = instructions.length - 1;
        instructions[block.index].jumpTo = endIndex + 1;
        continue;
      }

      throw makeLocalError(makeError, "parse", lineNo, `Неизвестная команда: ${op}.`);
    }

    if (blockStack.length) {
      const firstBlock = blockStack[0];
      const firstUnclosed = instructions[firstBlock.index];
      const opener = firstBlock.type === "if" ? "🤔" : (firstBlock.type === "loopCount" ? "🔂" : "🔁");
      throw makeLocalError(makeError, "parse", firstUnclosed.line, `Блок ${opener} не закрыт командой 😐.`);
    }

    return instructions;
  }

  function initialVariables() {
    const out = {};
    for (let i = 0; i < VARIABLE_EMOJIS.length; i++) out[VARIABLE_EMOJIS[i]] = 0;
    return out;
  }

  function assertFiniteNumber(value, line, context, makeError) {
    if (!Number.isFinite(value)) {
      throw makeLocalError(makeError, "runtime", line, `${context}: получено нечисловое значение.`);
    }
    return Math.trunc(value);
  }

  function isAsciiDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  function readNextInputNumber(inputText, state, line, makeError) {
    let idx = state.index;
    while (idx < inputText.length && /\s/u.test(inputText[idx])) idx += 1;

    if (idx >= inputText.length) {
      throw makeLocalError(makeError, "runtime", line, "Команда ⭐ не может читать из пустых входных данных.");
    }

    let valueText = "";
    while (idx < inputText.length && isAsciiDigit(inputText[idx])) {
      valueText += inputText[idx];
      idx += 1;
    }

    if (!valueText) {
      const got = inputText[idx];
      throw makeLocalError(makeError, "runtime", line, `Команда ⭐ ожидает число, получено: ${got}.`);
    }

    state.index = idx;
    const parsed = Number(valueText);
    return assertFiniteNumber(parsed, line, "Команда ⭐", makeError);
  }

  async function executeProgram(instructions, testInput, runtimeCtx) {
    const makeError = runtimeCtx.makeError;
    const hardStepLimit = Number.isInteger(runtimeCtx.hardStepLimit) ? runtimeCtx.hardStepLimit : 200000;
    const yieldEvery = Number.isInteger(runtimeCtx.yieldEvery) ? runtimeCtx.yieldEvery : 1500;

    const vars = initialVariables();
    const normalizedInput = String(testInput || "");
    const inputState = { index: 0 };
    const loopCountState = new Map();
    let output = "";
    let pc = 0;
    let steps = 0;

    while (pc < instructions.length) {
      if (steps >= hardStepLimit) {
        return {
          status: "limit",
          steps,
          output
        };
      }

      const ins = instructions[pc];
      steps += 1;

      if (ins.type === "set") {
        vars[ins.target] = ins.value;
        pc += 1;
      } else if (ins.type === "readNumber") {
        vars[ins.target] = readNextInputNumber(normalizedInput, inputState, ins.line, makeError);
        pc += 1;
      } else if (ins.type === "random") {
        const low = assertFiniteNumber(vars[ins.low], ins.line, "Команда 🎲 (нижняя граница)", makeError);
        const high = assertFiniteNumber(vars[ins.high], ins.line, "Команда 🎲 (верхняя граница)", makeError);
        if (low > high) {
          throw makeLocalError(makeError, "runtime", ins.line, `Команда 🎲: low (${low}) больше high (${high}).`);
        }
        const value = low + Math.floor(Math.random() * (high - low + 1));
        vars[ins.target] = assertFiniteNumber(value, ins.line, "Команда 🎲 (результат)", makeError);
        pc += 1;
      } else if (ins.type === "printNumber") {
        const value = assertFiniteNumber(vars[ins.target], ins.line, "Команда 😀", makeError);
        output += String(value);
        pc += 1;
      } else if (ins.type === "math") {
        const left = assertFiniteNumber(vars[ins.left], ins.line, `Команда ${ins.op}`, makeError);
        const right = assertFiniteNumber(vars[ins.right], ins.line, `Команда ${ins.op}`, makeError);
        let result = 0;

        if (ins.op === "➕") result = left + right;
        else if (ins.op === "➖") result = left - right;
        else if (ins.op === "✖") result = left * right;
        else if (ins.op === "➗") {
          if (right === 0) throw makeLocalError(makeError, "runtime", ins.line, "Команда ➗: деление на ноль.");
          result = Math.trunc(left / right);
        } else if (ins.op === "➰") {
          if (right === 0) throw makeLocalError(makeError, "runtime", ins.line, "Команда ➰: деление на ноль.");
          result = left % right;
        }

        vars[ins.left] = assertFiniteNumber(result, ins.line, `Команда ${ins.op}`, makeError);
        pc += 1;
      } else if (ins.type === "ifEq") {
        const left = assertFiniteNumber(vars[ins.left], ins.line, "Команда 🤔", makeError);
        const right = assertFiniteNumber(vars[ins.right], ins.line, "Команда 🤔", makeError);
        if (left === right) pc += 1;
        else pc = ins.jumpTo;
      } else if (ins.type === "loopCount") {
        if (!loopCountState.has(pc)) {
          const total = assertFiniteNumber(vars[ins.count], ins.line, "Команда 🔂", makeError);
          loopCountState.set(pc, total);
        }
        const remaining = loopCountState.get(pc);
        if (remaining > 0) {
          loopCountState.set(pc, remaining - 1);
          pc += 1;
        } else {
          loopCountState.delete(pc);
          pc = ins.jumpTo;
        }
      } else if (ins.type === "loopNeq") {
        const left = assertFiniteNumber(vars[ins.left], ins.line, "Команда 🔁", makeError);
        const right = assertFiniteNumber(vars[ins.right], ins.line, "Команда 🔁", makeError);
        if (left !== right) pc += 1;
        else pc = ins.jumpTo;
      } else if (ins.type === "ifEnd") {
        pc += 1;
      } else if (ins.type === "loopCountEnd") {
        pc = ins.loopIndex;
      } else if (ins.type === "loopEnd") {
        pc = ins.loopIndex;
      } else {
        throw makeLocalError(makeError, "runtime", ins.line, `Неизвестная инструкция типа ${ins.type}.`);
      }

      if (steps % yieldEvery === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return {
      status: "ok",
      steps,
      output,
      vars
    };
  }

  function createClassicDomain() {
    return {
      parseProgram,
      executeProgram,
      digits: DIGIT_EMOJIS.slice(),
      variables: VARIABLE_EMOJIS.slice()
    };
  }

  window.LovelaceDomains = window.LovelaceDomains || {};
  window.LovelaceDomains.createClassicDomain = createClassicDomain;
})();
