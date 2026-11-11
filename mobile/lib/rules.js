// Organizing rules = prompt.md (ships with the program, replaced on update) + prompt.local.md (the user's own, never tracked).
'use strict';
const fs = require('fs');

// Template written when prompt.local.md is missing; HTML comments are stripped, so it adds nothing to the prompt as-is.
const TEMPLATE = `<!--
這個檔案寫你自己的整理規則，AI 整理、修改、更新筆記時都會照著做；update.cmd 不會覆蓋它。
prompt.md 是程式附的基本規則，更新時會換成新版，請不要直接改它。
規則例如：標籤一律用中文、重點整理每點不超過兩行、不需要「思路脈絡」這一節。
這段說明不會送給 AI。請從最下面那行箭頭的下一行開始寫，一行一條規則。
-->

`;

const HEADING = '\n\n===== 使用者自訂規則 =====\n' +
  '以下是使用者自己加的整理規則。和上面的規則衝突時，以這裡為準；但輸出格式（TITLE、TAGS 等開頭的標頭行，以及後面附加的格式規則）一律照原規則。\n\n';

// User text without the template's HTML comments and BOM; '' when nothing is left.
function localText(raw) {
  return String(raw || '').replace(/^﻿/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

// Full rules text: the base rules, plus the user's block when it has any content.
function compose(base, local) {
  const b = String(base || '').replace(/^﻿/, '');
  const l = localText(local);
  return l ? b.replace(/\s+$/, '') + HEADING + l + '\n' : b;
}

// Reads both files (the local one may be missing).
async function load(baseFile, localFile) {
  const base = await fs.promises.readFile(baseFile, 'utf8');
  const local = localFile ? await fs.promises.readFile(localFile, 'utf8').catch(() => '') : '';
  return compose(base, local);
}

// Creates the commented template so users can find the file; never touches an existing one.
function ensureLocal(localFile) {
  if (!localFile || fs.existsSync(localFile)) return false;
  try { fs.writeFileSync(localFile, TEMPLATE, { flag: 'wx' }); return true; } catch { return false; }
}

module.exports = { TEMPLATE, HEADING, localText, compose, load, ensureLocal };
