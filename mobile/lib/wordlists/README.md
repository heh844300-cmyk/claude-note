# 詞頻表（每日英文閱讀用）

`lib/vocab.js` 用這些詞表判斷一個英文字有多常用，用來量測文章難度、找出讀者可能不認識的字。

| 檔案 | 內容 |
|---|---|
| `ngsl-1.2.txt` | New General Service List 1.2：2809 個最常用的英文字，**行的順序就是詞頻排名**（前 1000 行、1001～2000 行、其餘，分成三個頻段） |
| `ngsl-supplemental.txt` | NGSL 的補充字（星期、月份、數字） |
| `nawl-1.2.txt` | New Academic Word List 1.2：學術文章常用、但不在 NGSL 裡的字 |

每行是「原形 變化形 變化形…」，`#` 開頭的是說明。

## 出處與授權

- Browne, C., Culligan, B., & Phillips, J. (2013). *The New General Service List*. <https://www.newgeneralservicelist.com>
- Browne, C., Culligan, B., & Phillips, J. (2013). *The New Academic Word List*. <https://www.newgeneralservicelist.com>

這三個檔案以 [Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）](https://creativecommons.org/licenses/by-sa/4.0/) 授權，和本專案程式碼的 MIT 授權分開：修改或再散布這些檔案時，要保留出處並沿用同一個授權。

和原始檔的差異：只留下原形和變化形、全部小寫、依詞頻排名排序（排名取自 `NGSL_12_stats.csv`，變化形取自 `*_lemmatized_for_research.csv`）。

## 難度量測的驗證

`vocab.difficulty` 的分數是「不在最常用 1000 字裡的字的比例 ＋ 平均句長 ÷ 100」。用 [OneStopEnglish 語料](https://github.com/nishkalavallabhi/OneStopEnglishCorpus)（189 篇文章，各有初級、中級、高級三個版本；CC BY-SA 4.0，沒有放進這個專案）檢查：

- 同一篇文章的三個版本，排出正確難易順序的比例：92.6%（只用詞頻是 75.1%，只用句長是 72.5%）。
- 兩個分界點用一半的文章決定，在另一半文章上：三級完全判對 59.9%，差一級以內 95%。

所以這個量測用來比較候選文章、當作 AI 判斷之外的第二個依據，不單獨決定文章的等級。三級對應到 B1／B2／C1 是假設（語料本身沒有 CEFR 標示）。
