import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8').trim();
}

function safeRead(p) {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

function listHtmlFiles(dir, depth = 2) {
  const out = [];
  function walk(d, lvl) {
    if (lvl > depth) return;
    for (const name of readdirSync(d)) {
      if (name === '.git') continue;
      const full = path.join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, lvl + 1);
      } else if (st.isFile() && name.toLowerCase().endsWith('.html')) {
        out.push(full);
      }
    }
  }
  walk(dir, 0);
  out.sort();
  return out;
}

function rel(p) {
  return p.replace(process.cwd() + path.sep, '');
}

function parsePasswordsLocal() {
  const p = 'passwords.local.txt';
  if (!existsSync(p)) return null;
  const raw = safeRead(p);
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const kv = [];
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    kv.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return kv;
}

function main() {
  const now = new Date();
  const iso = now.toISOString();
  let head = '';
  let branch = '';
  try { head = sh('git rev-parse HEAD'); } catch {}
  try { branch = sh('git rev-parse --abbrev-ref HEAD'); } catch {}

  const stations = ['LOMONOSOV', 'ARKHIMED', 'LOVELACE', 'MORSE', 'VIGENERE', 'DA_VINCI', 'dev'];

  const stationPages = [];
  for (const s of stations) {
    if (!existsSync(s)) continue;
    const pages = listHtmlFiles(s, 3).map(rel);
    stationPages.push({ station: s, pages });
  }

  const pw = parsePasswordsLocal();

  const lines = [];
  lines.push('# AUTODOCS (local)');
  lines.push('');
  lines.push('Этот файл генерируется автоматически и должен быть **локальным** (в `.gitignore`).');
  lines.push('');
  lines.push('Сгенерировано: `' + iso + '`');
  if (branch) lines.push('Ветка: `' + branch + '`');
  if (head) lines.push('HEAD: `' + head + '`');
  lines.push('');

  lines.push('## Что это за проект');
  lines.push('');
  lines.push('- Корневой хаб: `index.html` ("Станции")');
  lines.push('- 6 станций: `LOMONOSOV/`, `ARKHIMED/`, `LOVELACE/`, `MORSE/`, `VIGENERE/`, `DA_VINCI/`');
  lines.push('- `dev/` — технический раздел (редактор/паззл)');
  lines.push('');

  lines.push('## Доступ/пароли (локально)');
  lines.push('');
  lines.push('Механизм: пароль станции хранится как SHA-256 хеш в `section-auth.js`, факт входа — в `sessionStorage` (токен сессии).');
  lines.push('');
  if (pw && pw.length) {
    lines.push('Пароли из `passwords.local.txt`:');
    lines.push('');
    for (const [k, v] of pw) lines.push('- `' + k + '` = `' + v + '`');
    lines.push('');
  } else {
    lines.push('`passwords.local.txt` не найден.');
    lines.push('');
  }

  lines.push('## Навигация и страницы');
  lines.push('');
  for (const sp of stationPages) {
    lines.push(`### ${sp.station}`);
    lines.push('');
    if (!sp.pages.length) {
      lines.push('- (страниц не найдено)');
    } else {
      for (const p of sp.pages) lines.push('- `' + p + '`');
    }
    lines.push('');
  }

  lines.push('## Сброс данных');
  lines.push('');
  lines.push('На главной есть кнопка `Сброс`: очищает `sessionStorage`, `localStorage`, cookie и `Cache Storage`.');
  lines.push('');

  lines.push('## Как обновлять автодоки');
  lines.push('');
  lines.push('- Ручной запуск: `node scripts/update_autodocs.mjs`');
  lines.push('- Автообновление: git hook `post-commit` (если установлен)');
  lines.push('');

  mkdirSync('.autodocs', { recursive: true });
  writeFileSync(path.join('.autodocs', 'AUTODOCS.md'), lines.join('\n'), 'utf8');
}

main();
